document.addEventListener('DOMContentLoaded', () => {
    const nobInput = document.getElementById('nob');
    const pcdInput = document.getElementById('pcd');
    const bdInchInput = document.getElementById('bd_inch');
    const zbdInput = document.getElementById('zbd');
    const rpmInput = document.getElementById('rpm');
    const angleInput = document.getElementById('angle');
    const calcBtn = document.getElementById('calcBtn');

    // Sync BD Inch to mm
    bdInchInput.addEventListener('input', () => {
        const mm = parseFloat(bdInchInput.value) * 25.4;
        if (!isNaN(mm)) {
            zbdInput.value = mm.toFixed(4);
            calculate();
        }
    });

    // Auto calculate on input change
    [nobInput, pcdInput, zbdInput, rpmInput, angleInput].forEach(input => {
        input.addEventListener('input', calculate);
    });

    calcBtn.addEventListener('click', calculate);

    function calculate() {
        const nob = parseFloat(nobInput.value);
        const pcd = parseFloat(pcdInput.value);
        const zbd = parseFloat(zbdInput.value);
        const rpm = parseFloat(rpmInput.value);
        const angleDeg = parseFloat(angleInput.value);

        if (isNaN(nob) || isNaN(pcd) || isNaN(zbd) || isNaN(rpm) || isNaN(angleDeg)) {
            return;
        }

        const angleRad = angleDeg * Math.PI / 180;
        const cosAngle = Math.cos(angleRad);
        const fr = rpm / 60; // Inner ring rotational frequency in Hz

        // Formulas
        // BPFO = RPM/60 * (NOB/2) * (1 - (zbd/pcd)*cos(angle))
        const bpfo = fr * (nob / 2) * (1 - (zbd / pcd) * cosAngle);
        
        // BPFI = RPM/60 * (NOB/2) * (1 + (zbd/pcd)*cos(angle))
        const bpfi = fr * (nob / 2) * (1 + (zbd / pcd) * cosAngle);
        
        // FTF = RPM/60 * (1/2) * (1 - (zbd/pcd)*cos(angle))
        const ftf = fr * 0.5 * (1 - (zbd / pcd) * cosAngle);
        
        // BSF = RPM/60 * (pcd/(2*zbd)) * (1 - (zbd/pcd * cos(angle))^2)
        const bsf = fr * (pcd / (2 * zbd)) * (1 - Math.pow((zbd / pcd) * cosAngle, 2));

        // RFB = 2 * BSF (as per user request "Rolling frequency of Irregularity of ball on both races")
        const rfb = 2 * bsf;

        // Update Table
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
    }

    function updateCell(id, val) {
        document.getElementById(id).textContent = val;
    }

    // Initial calculation
    calculate();
});
