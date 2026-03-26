let sineChart = null;
let envelopeChart = null;
let spectrumChart = null;
let spectrumChart500 = null;

// ──────────────────────────────────────────────────────────────
// uPlot Tooltip Plugin
// ──────────────────────────────────────────────────────────────
function tooltipPlugin() {
    let tooltip;

    return {
        hooks: {
            init: (u) => {
                tooltip = document.createElement("div");
                tooltip.className = "u-tooltip";
                u.root.querySelector(".u-over").appendChild(tooltip);
            },
            setCursor: (u) => {
                const { left, top, idx } = u.cursor;
                if (idx == null) {
                    tooltip.style.display = "none";
                    return;
                }

                const x = u.data[0][idx];
                const xLabel = u.axes[0].label || "X";
                let html = `<div><strong>${xLabel}: ${x.toFixed(3)}</strong></div>`;

                for (let i = 1; i < u.data.length; i++) {
                    const val = u.data[i][idx];
                    if (val !== null && val !== undefined) {
                        const series = u.series[i];
                        html += `<div style="color: ${series.stroke}">● ${series.label}: ${val.toFixed(4)}</div>`;
                    }
                }

                tooltip.innerHTML = html;
                tooltip.style.display = "block";
                tooltip.style.left = (left + 15) + "px";
                tooltip.style.top = (top + 15) + "px";
            }
        }
    };
}

function getUPlotBaseOptions(title, xLabel, yLabel, series) {
    return {
        title: title,
        width: 800,
        height: 350,
        plugins: [tooltipPlugin()],
        cursor: {
            drag: { x: true, y: true }
        },
        scales: {
            x: { time: false },
        },
        series: [
            { label: xLabel },
            ...series
        ],
        axes: [
            {
                label: xLabel,
                stroke: "#8b949e",
                grid: { stroke: "rgba(255, 255, 255, 0.05)" },
                ticks: { stroke: "#8b949e" }
            },
            {
                label: yLabel,
                stroke: "#8b949e",
                grid: { stroke: "rgba(255, 255, 255, 0.1)" },
                ticks: { stroke: "#8b949e" }
            }
        ],
        hooks: {
            setSelect: [
                u => {
                    let { left, top, width, height } = u.select;
                    if (width > 0 && height > 0) {
                        let xMin = u.posToVal(left, 'x');
                        let xMax = u.posToVal(left + width, 'x');
                        let yMin = u.posToVal(top + height, 'y');
                        let yMax = u.posToVal(top, 'y');
                        u.setScale('x', { min: xMin, max: xMax });
                        u.setScale('y', { min: yMin, max: yMax });
                        u.setSelect({ width: 0, height: 0 }, false);
                    }
                }
            ]
        }
    };
}

function resizeUPlot(u, containerId) {
    if (!u) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    const rect = container.getBoundingClientRect();
    u.setSize({
        width: rect.width,
        height: rect.height
    });
}

// ──────────────────────────────────────────────────────────────
// CHART PLOTTING
// ──────────────────────────────────────────────────────────────

function plotChart(t, waveforms) {
    const container = document.getElementById('sineChart');
    if (!container) return;
    container.innerHTML = "";

    const data = [
        t,
        waveforms.x,
        waveforms.y,
        waveforms.z
    ];

    const series = [
        { label: "Axis X", stroke: "#ff7b72", width: 2 },
        { label: "Axis Y", stroke: "#7ee787", width: 2, dash: [10, 5] },
        { label: "Axis Z", stroke: "#d2a8ff", width: 2, dash: [5, 5] }
    ];

    const opts = getUPlotBaseOptions("", "Time (s)", "Amplitude", series);
    sineChart = new uPlot(opts, data, container);
    resizeUPlot(sineChart, 'sineChart');
    window.addEventListener("resize", () => resizeUPlot(sineChart, 'sineChart'));

    container.addEventListener("dblclick", () => {
        sineChart.setData(data, true);
    });
}

function plotEnvelopes(t, stats) {
    const container = document.getElementById('envelopeChart');
    if (!container) return;
    container.innerHTML = "";

    const data = [t];
    const series = [];
    const colors = { x: '#ff7b72', y: '#7ee787', z: '#d2a8ff' };

    ['x', 'y', 'z'].forEach(axis => {
        if (stats[axis] && stats[axis].envelope && stats[axis].envelope.length > 0) {
            data.push(stats[axis].envelope);
            series.push({
                label: `Envelope ${axis.toUpperCase()}`,
                stroke: colors[axis],
                width: 1.5
            });
        }
    });

    if (data.length <= 1) return;

    const opts = getUPlotBaseOptions("", "Time (s)", "Envelope", series);
    envelopeChart = new uPlot(opts, data, container);
    resizeUPlot(envelopeChart, 'envelopeChart');
    window.addEventListener("resize", () => resizeUPlot(envelopeChart, 'envelopeChart'));

    container.addEventListener("dblclick", () => {
        envelopeChart.setData(data, true);
    });
}

function plotSpectrum(stats) {
    const container = document.getElementById('spectrumChart');
    if (!container) return;
    container.innerHTML = "";

    let freqLabels = [];
    const data = [];
    const series = [];
    const colors = { x: '#ff7b72', y: '#7ee787', z: '#d2a8ff' };

    ['x', 'y', 'z'].forEach(axis => {
        const s = stats[axis];
        if (!s || !s.freqs || s.freqs.length === 0) return;

        const N = s.envelope ? s.envelope.length : (s.fft_envelope.length * 2);
        const N_half = Math.floor(s.freqs.length / 2);
        const validIndices = [];
        
        for (let i = 1; i < N_half; i++) {
            if (s.freqs[i] >= 0 && s.freqs[i] <= 1000) {
                validIndices.push(i);
            }
        }

        if (freqLabels.length === 0) {
            freqLabels = validIndices.map(i => s.freqs[i]);
            data.push(freqLabels);
        }

        data.push(validIndices.map(i => (s.fft_envelope[i] * 2.0 / N)));
        series.push({
            label: `Spectrum ${axis.toUpperCase()}`,
            stroke: colors[axis],
            width: 1.5,
            fill: colors[axis] + "1a"
        });
    });

    if (data.length <= 1) return;

    const opts = getUPlotBaseOptions("", "Frequency (Hz)", "Amplitude (pk)", series);
    spectrumChart = new uPlot(opts, data, container);
    resizeUPlot(spectrumChart, 'spectrumChart');
    window.addEventListener("resize", () => resizeUPlot(spectrumChart, 'spectrumChart'));

    container.addEventListener("dblclick", () => {
        spectrumChart.setData(data, true);
    });
}

function plotSpectrum500(stats) {
    const container = document.getElementById('spectrumChart500');
    if (!container) return;
    container.innerHTML = "";

    let freqLabels = [];
    const data = [];
    const series = [];
    const colors = { x: '#ff7b72', y: '#7ee787', z: '#d2a8ff' };

    ['x', 'y', 'z'].forEach(axis => {
        const s = stats[axis];
        if (!s || !s.freqs || s.freqs.length === 0) return;

        const N = s.envelope ? s.envelope.length : (s.fft_envelope.length * 2);
        const N_half = Math.floor(s.freqs.length / 2);
        const validIndices = [];
        
        for (let i = 1; i < N_half; i++) {
            if (s.freqs[i] >= 10 && s.freqs[i] <= 500) {
                validIndices.push(i);
            }
        }

        if (freqLabels.length === 0) {
            freqLabels = validIndices.map(i => s.freqs[i]);
            data.push(freqLabels);
        }

        data.push(validIndices.map(i => (s.fft_envelope[i] * 2.0 / N)));
        series.push({
            label: `Spectrum ${axis.toUpperCase()}`,
            stroke: colors[axis],
            width: 1.5,
            fill: colors[axis] + "1a"
        });
    });

    if (data.length <= 1) return;

    const opts = getUPlotBaseOptions("", "Frequency (Hz)", "Amplitude (pk)", series);
    spectrumChart500 = new uPlot(opts, data, container);
    resizeUPlot(spectrumChart500, 'spectrumChart500');
    window.addEventListener("resize", () => resizeUPlot(spectrumChart500, 'spectrumChart500'));

    container.addEventListener("dblclick", () => {
        spectrumChart500.setData(data, true);
    });
}

// ──────────────────────────────────────────────────────────────
// STATS TABLE
// ──────────────────────────────────────────────────────────────

function updateStats(stats) {
    if (!stats) return;

    const axes = ['x', 'y', 'z'];
    axes.forEach(axis => {
        const s = stats[axis];
        if (!s) return;

        const peakEl = document.getElementById(`val_peak_${axis}`);
        const grmsEl = document.getElementById(`val_grms_${axis}`);
        const vrmsEl = document.getElementById(`val_vrms_${axis}`);
        const geEl = document.getElementById(`val_ge_${axis}`);
        const gEopEl = document.getElementById(`val_gEop_${axis}`);
        const gEPPEl = document.getElementById(`val_gEPP_${axis}`);
        const skewEl = document.getElementById(`val_skewness_${axis}`);
        const kurtEl = document.getElementById(`val_kurtosis_${axis}`);
        const crestEl = document.getElementById(`val_crest_${axis}`);

        if (peakEl) peakEl.textContent = s.peak.toFixed(4);
        if (grmsEl) grmsEl.textContent = s.grms.toFixed(4);
        if (vrmsEl) vrmsEl.textContent = s.vrms.toFixed(4);
        if (geEl) geEl.textContent = s.ge.toFixed(4);
        if (gEopEl) gEopEl.textContent = s.gEop.toFixed(4);
        if (gEPPEl) gEPPEl.textContent = s.gEPP.toFixed(4);
        if (skewEl) skewEl.textContent = s.skewness.toFixed(4);
        if (kurtEl) kurtEl.textContent = s.kurtosis.toFixed(4);
        if (crestEl) crestEl.textContent = s.crest_factor.toFixed(4);
    });

    plotEnvelopes(stats.t_vec || stats.t || [], stats);
    plotSpectrum(stats);
    plotSpectrum500(stats);
}

// ──────────────────────────────────────────────────────────────
// SINE WAVE (generated)
// ──────────────────────────────────────────────────────────────

async function fetchAndPlot() {
    const a = document.getElementById('amplitude').value;
    const f = document.getElementById('frequency').value;
    const o = document.getElementById('omega').value;
    const rpm = document.getElementById('rpm').value;

    try {
        const response = await fetch(`/api/sine-wave?a=${a}&f=${f}&o=${o}&rpm=${rpm}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `Server error ${response.status}`);
        }
        const data = await response.json();
        plotChart(data.t, data.waveforms);
        updateStats(data.stats);
    } catch (error) {
        console.error('Error fetching sine wave:', error);
        showGlobalError(error.message);
    }
}

// ──────────────────────────────────────────────────────────────
// CSV UPLOAD
// ──────────────────────────────────────────────────────────────

async function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    const rpm = document.getElementById('rpm').value;

    if (!fileInput.files[0]) {
        alert('Please select a CSV file first.');
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        const response = await fetch(`/api/upload-csv?rpm=${rpm}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Upload failed');
        }

        const data = await response.json();
        plotChart(data.t, data.waveforms);
        updateStats(data.stats);
    } catch (error) {
        console.error('Error uploading CSV:', error);
        alert(`CSV Error: ${error.message}`);
    }
}

// ──────────────────────────────────────────────────────────────
// ARRAY PARSING HELPERS
// ──────────────────────────────────────────────────────────────

function parseArrayInput(raw) {
    if (!raw || raw.trim() === '') {
        return { values: null, error: 'Field is empty.', empty: true };
    }
    const cleaned = raw.replace(/[\[\]()]/g, '').trim();
    const tokens = cleaned.split(/[\s,]+/).filter(t => t.length > 0);
    if (tokens.length === 0) {
        return { values: null, error: 'No numbers found.', empty: false };
    }
    const values = [];
    for (const token of tokens) {
        const num = parseFloat(token);
        if (isNaN(num)) {
            return { values: null, error: `Invalid: "${token}"`, empty: false };
        }
        values.push(num);
    }
    if (values.length < 4) {
        return { values: null, error: `Need 4+ values (got ${values.length})`, empty: false };
    }
    return { values, error: null, empty: false };
}

function validateAxisField(axisId) {
    const textarea = document.getElementById(`array${axisId.toUpperCase()}`);
    const errEl = document.getElementById(`err_${axisId}`);
    const countEl = document.getElementById(`count_${axisId}`);
    if (!textarea) return { valid: false, empty: true };

    const raw = textarea.value.trim();
    const { values, error, empty } = parseArrayInput(raw);

    if (empty) {
        textarea.classList.remove('has-error', 'is-valid');
        if (errEl) errEl.textContent = '';
        if (countEl) countEl.textContent = '';
        return { valid: false, empty: true };
    }

    if (error) {
        textarea.classList.add('has-error');
        textarea.classList.remove('is-valid');
        if (errEl) errEl.textContent = error;
        if (countEl) countEl.textContent = '';
        return { valid: false, empty: false };
    }

    textarea.classList.remove('has-error');
    textarea.classList.add('is-valid');
    if (errEl) errEl.textContent = '';
    if (countEl) countEl.textContent = `${values.length} values`;
    return { valid: true, empty: false, values };
}

// ──────────────────────────────────────────────────────────────
// PROCESS SEPARATE X/Y/Z ARRAYS
// ──────────────────────────────────────────────────────────────

async function processArrayAxes() {
    const rpm = document.getElementById('rpm').value;
    const banner = document.getElementById('arrayErrorBanner');
    if (banner) {
        banner.style.display = 'none';
        banner.textContent = '';
    }

    const results = {
        x: validateAxisField('x'),
        y: validateAxisField('y'),
        z: validateAxisField('z'),
    };

    if (results.x.empty && results.y.empty && results.z.empty) {
        showArrayError('Please enter data for at least one axis.');
        return;
    }

    const hasError = (!results.x.empty && !results.x.valid) ||
        (!results.y.empty && !results.y.valid) ||
        (!results.z.empty && !results.z.valid);

    if (hasError) {
        showArrayError('Please fix the errors in the input fields.');
        return;
    }

    const payload = {
        x: results.x.values || [],
        y: results.y.values || [],
        z: results.z.values || [],
    };

    try {
        const response = await fetch(`/api/process-array-axes?rpm=${rpm}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `Server error ${response.status}`);
        }

        const data = await response.json();
        plotChart(data.t, data.waveforms);
        updateStats(data.stats);
    } catch (error) {
        console.error('Error processing arrays:', error);
        showArrayError(error.message);
    }
}

function showArrayError(msg) {
    const banner = document.getElementById('arrayErrorBanner');
    if (banner) {
        banner.textContent = msg;
        banner.style.display = 'block';
    }
}

function showGlobalError(msg) {
    console.error(msg);
}

// ──────────────────────────────────────────────────────────────
// EVENT WIRING
// ──────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFile');
    if (csvFileInput) {
        csvFileInput.addEventListener('change', function (e) {
            const fileName = e.target.files[0] ? e.target.files[0].name : 'or drag and drop here';
            const msgEl = document.querySelector('.file-msg');
            if (msgEl) msgEl.textContent = fileName;
        });
    }

    const plotBtn = document.getElementById('plotBtn');
    if (plotBtn) plotBtn.addEventListener('click', fetchAndPlot);

    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) uploadBtn.addEventListener('click', uploadCSV);

    const processArrayBtn = document.getElementById('processArrayBtn');
    if (processArrayBtn) processArrayBtn.addEventListener('click', processArrayAxes);

    ['X', 'Y', 'Z'].forEach(axis => {
        const el = document.getElementById(`array${axis}`);
        if (el) {
            el.addEventListener('input', () => validateAxisField(axis.toLowerCase()));
        }
    });

    fetchAndPlot();
});