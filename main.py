from typing import Optional, List, Dict, Tuple
from fastapi import FastAPI, Query, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import numpy as np
import pandas as pd
import io
import os
import math
from scipy.signal import butter, filtfilt, hilbert, detrend
from scipy.fft import fft, rfft, rfftfreq
from scipy.integrate import cumulative_trapezoid
import matplotlib.pyplot as plt

app = FastAPI(title="Sine Wave & CSV Analyzer")


# ──────────────────────────────────────────────────────────────
# FILTERS
# ──────────────────────────────────────────────────────────────

def _highpass_filter(data: np.ndarray, fs: float, cutoff: float = 2.0, order: int = 4) -> np.ndarray:
    nyquist = 0.5 * fs
    normal_cutoff = cutoff / nyquist
    b, a = butter(order, normal_cutoff, btype='high', analog=False)
    return filtfilt(b, a, data)


def _adaptive_bandpass(signal: np.ndarray, fs: float, rpm: float, order: int = 4) -> np.ndarray:
    # f_rot = rpm / 60.0
    lowcut = 500
    highcut = 10000
    nyq = 0.5 * fs
    # highcut = min(highcut, nyq * 0.9)
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype="band")
    return filtfilt(b, a, signal)


def mean(data):
    return sum(data) / len(data)


def std_population(data, mu):
    return math.sqrt(sum((x - mu) ** 2 for x in data) / len(data))


def skewness(data):
    mu = mean(data)
    std = std_population(data, mu)

    if std == 0:
        return 0.0

    return sum(((x - mu) / std) ** 3 for x in data) / len(data)


def kurtosis(data):
    mu = mean(data)
    std = std_population(data, mu)

    if std == 0:
        return 0.0

    return sum(((x - mu) / std) ** 4 for x in data) / len(data)
# ──────────────────────────────────────────────────────────────
# STATISTICAL ACCUMULATOR
# ──────────────────────────────────────────────────────────────

class StatisticalAccumulator:
    def __init__(self):
        self.daq_rate: Optional[float] = None
        self.rpm: Optional[float] = None
        self.amplitude: Optional[float] = None

    def set_params(self, daq_rate: float, rpm: float, amplitude: float = 1.0):
        self.daq_rate = daq_rate
        self.rpm = rpm
        self.amplitude = amplitude

    # FIX: was incorrectly typed as `data: data` (referencing the module-level array).
    # Now correctly typed as `data: np.ndarray`.
    def compute(self, data: np.ndarray) -> Dict:
        if not self.daq_rate:
            return {}

        fs = self.daq_rate
        print("fs", fs)
        print("amplitude", self.amplitude)

        # Remove DC
        detrended = data

        # GRMS
        grms = np.sqrt(np.mean(detrended ** 2))

        # Crest Factor
        peak = np.max((detrended))
        crest_factor = peak / grms if grms > 0 else 0.0

        # Shape Metrics
        std = np.std(detrended)
        print("std", std)
        if std > 0:
            # skewness = float(np.mean((detrended / std) ** 3))
            # kurtosis = float(np.mean((detrended / std) ** 4))
            skewness_val = skewness(detrended)
            kurtosis_val = kurtosis(detrended) -3
        else:
            skewness_val = kurtosis_val = 0.0

        # VRMS
        vrms = self._compute_vrms(detrended, fs, self.amplitude)

        # Envelope RMS
        ge, envelope = self._compute_ge(detrended, fs)

        # FFT of Envelope
        # Note: Added fallback for empty envelope or errors
        if envelope is not None and len(envelope) > 0:
            N = len(envelope)
            freqs = np.fft.fftfreq(N,1/fs)
            fft_envelope = np.abs(fft(envelope))
        else:
            fft_envelope = np.array([])
            freqs = np.array([])

        return {
            "grms": round(float(grms), 4),
            "vrms": round(float(vrms), 4),
            "ge": round(float(ge), 4),
            "skewness": round(skewness_val, 4),
            "kurtosis": round(kurtosis_val, 4),
            "crest_factor": round(float(crest_factor), 4),
            "peak": round(float(peak), 4),
            "envelope": envelope.tolist() if envelope is not None else [],
            "fft_envelope": fft_envelope.tolist(),
            "freqs": freqs.tolist(),
        }

    def _compute_vrms(self, acc_rms_g: np.ndarray, fs: float, amplitude: float) -> float:
        if len(acc_rms_g) < 10:
            return 0.0
        vrms = (amplitude * 9.8) / (6.28 * fs) * 1000
        return float(vrms)

    def _compute_ge(self, detrended: np.ndarray, fs: float) -> Tuple[float, Optional[np.ndarray]]:
        if not self.rpm or len(detrended) < 13:
            return 0.0, None
        try:
            filtered_signal = _adaptive_bandpass(detrended, fs, self.rpm)
            analytic_signal = hilbert(filtered_signal)
            envelope = np.abs(analytic_signal)
            # Return RMS of envelope for 'ge' value
            ge_val = np.sqrt(np.mean(envelope ** 2))
            return float(ge_val), envelope
        except Exception as e:
            print(f"Error in _compute_ge: {e}")
            return 0.0, None


# ──────────────────────────────────────────────────────────────
# REQUEST MODEL FOR 3-AXIS ARRAY INPUT
# ──────────────────────────────────────────────────────────────

class ThreeAxisArrayInput(BaseModel):
    x: List[float]
    y: List[float]
    z: List[float]


# ──────────────────────────────────────────────────────────────
# APP SETUP
# ──────────────────────────────────────────────────────────────

if not os.path.exists("static"):
    os.makedirs("static")

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def read_index():
    return FileResponse("static/index.html")


@app.get("/bearing-calc")
async def read_bearing_calc():
    return FileResponse("static/bearing_frequency.html")


# ──────────────────────────────────────────────────────────────
# SINE WAVE ENDPOINT
# ──────────────────────────────────────────────────────────────

@app.get("/api/sine-wave")
async def get_sine_wave(
    a: float = Query(1.0),
    f: float = Query(1.0),
    o: float = Query(0.0),
    rpm: float = Query(1800.0),
    points: int = Query(500)
):
    t = np.linspace(0, 1, points)
    y_base = a * np.sin(2 * np.pi * f * t + o)

    waveforms = {
        "x": y_base.tolist(),
        "y": y_base.tolist(),
        "z": y_base.tolist()
    }

    accumulator = StatisticalAccumulator()
    accumulator.set_params(daq_rate=f, rpm=rpm, amplitude=a)
    axis_stats = accumulator.compute(y_base)

    stats = {"x": axis_stats, "y": axis_stats, "z": axis_stats}

    return {"t": t.tolist(), "waveforms": waveforms, "stats": stats}


# ──────────────────────────────────────────────────────────────
# CSV UPLOAD ENDPOINT
# ──────────────────────────────────────────────────────────────

@app.post("/api/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    rpm: float = Query(1800.0)
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))

        cols = [col for col in df.columns if df[col].dtype in [np.float64, np.int64]]
        if not cols:
            raise HTTPException(status_code=400, detail="No numeric data found in CSV")

        axes_map = {}
        for axis in ['x', 'y', 'z']:
            found = False
            for col in cols:
                if axis in col.lower():
                    axes_map[axis] = col
                    found = True
                    break
            if not found and cols:
                idx = ['x', 'y', 'z'].index(axis)
                axes_map[axis] = cols[idx] if idx < len(cols) else cols[-1]

        t = np.linspace(0, 1, len(df))
        if 'time' in [c.lower() for c in df.columns]:
            time_col = [c for c in df.columns if c.lower() == 'time'][0]
            t = df[time_col].values.tolist()
        else:
            t = t.tolist()

        waveforms = {}
        stats = {}
        accumulator = StatisticalAccumulator()
        accumulator.set_params(
            daq_rate=len(df),
            rpm=rpm,
            amplitude=float(df.iloc[:, 0].abs().max())
        )

        for axis, col in axes_map.items():
            signal = df[col].values
            waveforms[axis] = signal.tolist()
            stats[axis] = accumulator.compute(signal)

        return {"t": t, "waveforms": waveforms, "stats": stats, "filename": file.filename}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")


# ──────────────────────────────────────────────────────────────
# SINGLE ARRAY ENDPOINT (legacy — all axes share same data)
# ──────────────────────────────────────────────────────────────

@app.post("/api/process-array")
async def process_array(
    data: List[float],
    rpm: float = Query(1800.0)
):
    try:
        signal = np.array(data)
        if len(signal) == 0:
            raise HTTPException(status_code=400, detail="Array is empty")
        if len(signal) < 4:
            raise HTTPException(status_code=400, detail="Array must have at least 4 values")

        t = np.linspace(0, 1, len(signal)).tolist()

        accumulator = StatisticalAccumulator()
        accumulator.set_params(
            daq_rate=len(signal),
            rpm=rpm,
            amplitude=float(np.abs(signal).max())
        )
        axis_stats = accumulator.compute(signal)

        return {
            "t": t,
            "waveforms": {"x": data, "y": data, "z": data},
            "stats": {"x": axis_stats, "y": axis_stats, "z": axis_stats}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing array: {str(e)}")


# ──────────────────────────────────────────────────────────────
# NEW: SEPARATE X / Y / Z ARRAY ENDPOINT
# ──────────────────────────────────────────────────────────────

@app.post("/api/process-array-axes")
async def process_array_axes(
    payload: ThreeAxisArrayInput,
    rpm: float = Query(1800.0)
):
    """
    Accept independent arrays for X, Y, and Z axes.
    Arrays can have different lengths; each is analysed independently.
    The time vector is built from the longest array so the chart aligns them.
    """
    errors = {}
    arrays: Dict[str, np.ndarray] = {}

    for axis in ["x", "y", "z"]:
        raw: List[float] = getattr(payload, axis)
        if len(raw) == 0:
            errors[axis] = "Array is empty"
            continue
        if len(raw) < 4:
            errors[axis] = "Array must have at least 4 values"
            continue
        arrays[axis] = np.array(raw, dtype=float)

    if errors:
        detail = "; ".join(f"Axis {k.upper()}: {v}" for k, v in errors.items())
        raise HTTPException(status_code=422, detail=detail)

    # Build a shared time vector based on the longest signal (1 second window)
    max_len = max(len(arr) for arr in arrays.values())
    t = np.linspace(0, 1, max_len).tolist()

    waveforms: Dict[str, list] = {}
    stats: Dict[str, dict] = {}

    for axis, signal in arrays.items():
        amplitude = float(np.abs(signal).max()) if np.abs(signal).max() > 0 else 1.0
        daq_rate = float(len(signal))

        accumulator = StatisticalAccumulator()
        accumulator.set_params(daq_rate=daq_rate, rpm=rpm, amplitude=amplitude)

        # Pad shorter arrays with NaN so chart lengths match (Chart.js skips NaN)
        if len(signal) < max_len:
            padded = np.full(max_len, np.nan)
            padded[:len(signal)] = signal
            waveforms[axis] = [None if np.isnan(v) else v for v in padded.tolist()]
        else:
            waveforms[axis] = signal.tolist()

        stats[axis] = accumulator.compute(signal)

    return {"t": t, "waveforms": waveforms, "stats": stats}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)