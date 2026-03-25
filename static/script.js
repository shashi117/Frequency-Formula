let sineChart = null;
let spectrumChart = null;

// ──────────────────────────────────────────────────────────────
// CHART
// ──────────────────────────────────────────────────────────────

function plotChart(t, waveforms) {
    const ctx = document.getElementById('sineChart').getContext('2d');

    if (sineChart) {
        sineChart.destroy();
    }

    sineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: t.map(val => parseFloat(val).toFixed(3)),
            datasets: [
                {
                    label: 'Axis X',
                    data: waveforms.x,
                    borderColor: '#ff7b72',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    tension: 0.4,
                    spanGaps: false
                },
                {
                    label: 'Axis Y',
                    data: waveforms.y,
                    borderColor: '#7ee787',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    borderDash: [5, 5],
                    spanGaps: false
                },
                {
                    label: 'Axis Z',
                    data: waveforms.z,
                    borderColor: '#d2a8ff',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4,
                    borderDash: [2, 2],
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#8b949e', font: { family: 'Outfit' } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e', maxTicksLimit: 10 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#8b949e' }
                }
            }
        }
    });
}

function plotSpectrum(stats) {
    const canvas = document.getElementById('spectrumChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const s = stats.x || stats.y || stats.z;
    if (!s || !s.freqs || s.freqs.length === 0) return;

    if (spectrumChart) {
        spectrumChart.destroy();
    }

    // Limit to 0-1000Hz
    const N_half = Math.floor(s.freqs.length / 2);
    const validIndices = [];
    for (let i = 0; i < N_half; i++) {
        if (s.freqs[i] <= 1000) {
            validIndices.push(i);
        }
    }

    const filteredFreqs = validIndices.map(i => s.freqs[i].toFixed(1));
    const filteredAmps = validIndices.map(i => s.fft_envelope[i]);

    spectrumChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: filteredFreqs,
            datasets: [{
                label: 'Envelope Spectrum (X)',
                data: filteredAmps,
                borderColor: '#58a6ff',
                backgroundColor: 'rgba(88, 166, 255, 0.1)',
                borderWidth: 1.5,
                fill: true,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Frequency (Hz)', color: '#8b949e' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e', maxTicksLimit: 20 }
                },
                y: {
                    title: { display: true, text: 'Amplitude', color: '#8b949e' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#8b949e' }
                }
            }
        }
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
        const skewEl = document.getElementById(`val_skewness_${axis}`);
        const kurtEl = document.getElementById(`val_kurtosis_${axis}`);
        const crestEl = document.getElementById(`val_crest_${axis}`);

        if (peakEl) peakEl.textContent = s.peak.toFixed(4);
        if (grmsEl) grmsEl.textContent = s.grms.toFixed(4);
        if (vrmsEl) vrmsEl.textContent = s.vrms.toFixed(4);
        if (geEl) geEl.textContent = s.ge.toFixed(4);
        if (skewEl) skewEl.textContent = s.skewness.toFixed(4);
        if (kurtEl) kurtEl.textContent = s.kurtosis.toFixed(4);
        if (crestEl) crestEl.textContent = s.crest_factor.toFixed(4);
    });

    plotSpectrum(stats);
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