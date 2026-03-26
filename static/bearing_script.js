let bearingSpectrumChart = null;

document.addEventListener('DOMContentLoaded', () => {
    const nobInput = document.getElementById('nob');
    const pcdInput = document.getElementById('pcd');
    const bdInchInput = document.getElementById('bd_inch');
    const zbdInput = document.getElementById('zbd');
    const rpmInput = document.getElementById('rpm');
    const angleInput = document.getElementById('angle');
    const calcBtn = document.getElementById('calcBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');

    const allInputs = [nobInput, pcdInput, bdInchInput, zbdInput, rpmInput, angleInput, calcBtn];

    // Array Inputs
    const xArrayInput = document.getElementById('bearing_x_array');
    const yArrayInput = document.getElementById('bearing_y_array');
    const zArrayInput = document.getElementById('bearing_z_array');

    // Sync BD Inch to mm
    bdInchInput.addEventListener('input', () => {
        const mm = parseFloat(bdInchInput.value) * 25.4;
        if (!isNaN(mm)) {
            zbdInput.value = mm.toFixed(4);
            calculate();
        }
    });

    // Auto calculate on parameter change
    [nobInput, pcdInput, zbdInput, rpmInput, angleInput].forEach(input => {
        input.addEventListener('input', calculate);
    });

    calcBtn.addEventListener('click', async () => {
        showLoading(true);
        try {
            const stats = calculate();
            if (xArrayInput.value.trim()) {
                await processArrays(stats);
            }
        } finally {
            showLoading(false);
        }
    });

    function showLoading(show) {
        if (loadingOverlay) loadingOverlay.style.display = show ? 'flex' : 'none';
        allInputs.forEach(input => {
            if (input) input.disabled = show;
        });
        [xArrayInput, yArrayInput, zArrayInput].forEach(input => {
            if (input) input.disabled = show;
        });
    }

    async function processArrays(bearingFrequencies) {
        const parseArr = (s) => s.split(/[,\s]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
        
        const xArr = parseArr(xArrayInput.value);
        const yArr = parseArr(yArrayInput.value);
        const zArr = parseArr(zArrayInput.value);
        
        if (xArr.length === 0) {
            console.warn("X array is required and empty");
            return;
        }

        const rpm = parseFloat(rpmInput.value) || 1800;

        try {
            const response = await fetch(`/api/process-array-axes?rpm=${rpm}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x: xArr, y: yArr, z: zArr })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Failed to process arrays");
            }
            const data = await response.json();
            
            plotBearingSpectrum(data.stats);
            updateHarmonicsTable(bearingFrequencies, data.stats);
        } catch (error) {
            console.error("Error processing arrays:", error);
            alert("Error: " + error.message);
        }
    }

    function calculate() {
        const nob = parseFloat(nobInput.value);
        const pcd = parseFloat(pcdInput.value);
        const zbd = parseFloat(zbdInput.value);
        const rpm = parseFloat(rpmInput.value);
        const angleDeg = parseFloat(angleInput.value);

        if (isNaN(nob) || isNaN(pcd) || isNaN(zbd) || isNaN(rpm) || isNaN(angleDeg)) {
            return null;
        }

        const angleRad = angleDeg * Math.PI / 180;
        const cosAngle = Math.cos(angleRad);
        const fr = rpm / 60; 

        const bpfo = fr * (nob / 2) * (1 - (zbd / pcd) * cosAngle);
        const bpfi = fr * (nob / 2) * (1 + (zbd / pcd) * cosAngle);
        const ftf = fr * 0.5 * (1 - (zbd / pcd) * cosAngle);
        const bsf = fr * (pcd / (2 * zbd)) * (1 - Math.pow((zbd / pcd) * cosAngle, 2));
        const rfb = 2 * bsf;

        updateCell('res_irf_hz', fr.toFixed(2));
        updateCell('res_irf_order', '1.00');
        updateCell('res_orf_hz', '0.00');
        updateCell('res_orf_order', '0.00');
        updateCell('res_ftf_hz', ftf.toFixed(2));
        updateCell('res_ftf_order', (ftf / fr).toFixed(4));
        updateCell('res_bsf_hz', bsf.toFixed(2));
        updateCell('res_bsf_order', (bsf / fr).toFixed(4));
        updateCell('res_bpfi_hz', bpfi.toFixed(2));
        updateCell('res_bpfi_order', (bpfi / fr).toFixed(4));
        updateCell('res_bpfo_hz', bpfo.toFixed(2));
        updateCell('res_bpfo_order', (bpfo / fr).toFixed(4));
        updateCell('res_rfb_hz', rfb.toFixed(2));
        updateCell('res_rfb_order', (rfb / fr).toFixed(4));

        return { fr, bpfo, bpfi, ftf, bsf };
    }

    function updateCell(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ──────────────────────────────────────────────────────────────
    // uPlot Logic
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
                    let html = `<div><strong>Freq: ${x.toFixed(2)} Hz</strong></div>`;
                    for (let i = 1; i < u.data.length; i++) {
                        const val = u.data[i][idx];
                        if (val != null) {
                            html += `<div style="color: ${u.series[i].stroke}">● ${u.series[i].label}: ${val.toFixed(5)}</div>`;
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

    function plotBearingSpectrum(stats) {
        const container = document.getElementById('bearingSpectrumChart');
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

        const opts = {
            width: container.offsetWidth,
            height: 350,
            plugins: [tooltipPlugin()],
            cursor: { drag: { x: true, y: true } },
            scales: { x: { time: false } },
            series: [{ label: "Freq" }, ...series],
            axes: [
                { label: "Frequency (Hz)", stroke: "#8b949e", grid: { stroke: "rgba(255,255,255,0.05)" } },
                { label: "Amplitude", stroke: "#8b949e", grid: { stroke: "rgba(255,255,255,0.1)" } }
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

        bearingSpectrumChart = new uPlot(opts, data, container);
        window.addEventListener("resize", () => {
            bearingSpectrumChart.setSize({ width: container.offsetWidth, height: 350 });
        });

        // Double-click to reset zoom
        container.addEventListener("dblclick", () => {
            bearingSpectrumChart.setData(data, true); // Reset zoom
        });
    }

    function updateHarmonicsTable(bearingFreqs, stats) {
        if (!bearingFreqs || !stats) return;

        const defects = [
            { key: 'bsf', label: 'Ball Spin (BSF)', base: bearingFreqs.bsf },
            { key: 'bpfo', label: 'Outer Race (BPFO)', base: bearingFreqs.bpfo },
            { key: 'bpfi', label: 'Inner Race (BPFI)', base: bearingFreqs.bpfi },
            { key: 'ftf', label: 'Cage (FTF)', base: bearingFreqs.ftf }
        ];

        // Use Axis X for harmonics lookup by default (most likely)
        const axisData = stats.x;
        if (!axisData) return;

        const N = axisData.envelope ? axisData.envelope.length : (axisData.fft_envelope.length * 2);

        defects.forEach(defect => {
            for (let h = 1; h <= 6; h++) {
                const targetFreq = defect.base * h;
                const result = getPeakInWindow(targetFreq, axisData, N);
                
                const fEl = document.getElementById(`${defect.key}_f${h}`);
                const aEl = document.getElementById(`${defect.key}_a${h}`);
                
                if (fEl) fEl.textContent = result.freq.toFixed(2);
                if (aEl) aEl.textContent = result.amp.toFixed(5);
            }
        });
    }

    function getPeakInWindow(targetFreq, axisData, N) {
        if (!axisData || !axisData.freqs || !axisData.fft_envelope) {
            return { amp: 0, freq: targetFreq };
        }
        
        const windowHz = 5.0;
        const fMin = targetFreq - windowHz;
        const fMax = targetFreq + windowHz;

        let maxAmp = 0;
        let peakFreq = targetFreq;
        let found = false;

        for (let i = 0; i < axisData.freqs.length; i++) {
            const f = axisData.freqs[i];
            if (f > fMax) break;
            if (f >= fMin) {
                const amp = axisData.fft_envelope[i] * 2.0 / N;
                if (amp > maxAmp) {
                    maxAmp = amp;
                    peakFreq = f;
                }
                found = true;
            }
        }

        if (!found) {
            let nearestIdx = 0;
            let minDiff = Infinity;
            for (let i = 0; i < axisData.freqs.length; i++) {
                let diff = Math.abs(axisData.freqs[i] - targetFreq);
                if (diff < minDiff) {
                    minDiff = diff;
                    nearestIdx = i;
                }
            }
            return {
                amp: axisData.fft_envelope[nearestIdx] * 2.0 / N,
                freq: axisData.freqs[nearestIdx]
            };
        }

        return { amp: maxAmp, freq: peakFreq };
    }

    calculate();
});
