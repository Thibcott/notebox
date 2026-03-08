const TARGET_MINUTES = 504; // 8h24
let timeData = {};
let currentDateStr = getTodayStr();
let clockInterval = null;

const btnToggleSidebar = document.getElementById("btnToggleSidebar");
if (btnToggleSidebar) {
    btnToggleSidebar.onclick = (e) => {
        e.stopPropagation();
        document.querySelector(".app").classList.toggle("show-sidebar");
    };
}
document.querySelector(".main").addEventListener("click", (e) => {
    if (!e.target.closest('#btnToggleSidebar')) {
        document.querySelector(".app").classList.remove("show-sidebar");
    }
});

function getTodayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function loadData() {
    const res = await fetch("/notebox/api/time");
    timeData = await res.json();
    if (!timeData[currentDateStr]) {
        timeData[currentDateStr] = { intervals: [], manualAdjustment: 0 };
    }
    render();
}

async function saveData() {
    await fetch("/notebox/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(timeData)
    });
    render();
}

function parseTime(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

function computeDailyMinutes(record) {
    if (!record) return 0;
    let total = 0;
    const now = new Date();
    record.intervals.forEach(inv => {
        const start = parseTime(inv.start);
        const end = inv.stop ? parseTime(inv.stop) : now;
        if (start) {
            total += (end - start) / 60000;
        }
    });
    total += (record.manualAdjustment || 0);
    return Math.round(total);
}

function formatMinutes(mins) {
    const sign = mins < 0 ? '-' : '';
    const abs = Math.abs(mins);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
}



function render() {
    const record = timeData[currentDateStr];
    const list = document.getElementById("intervalsList");
    list.innerHTML = "";

    let isWorking = false;

    record.intervals.forEach((inv, i) => {
        if (!inv.stop) isWorking = true;
        const div = document.createElement("div");
        div.style = "display:flex; justify-content:space-between; align-items:center; background:#252526; padding:10px 14px; border-radius:6px; border: 1px solid #333333;";
        div.innerHTML = `
      <span>${inv.start} &rarr; ${inv.stop || `<span style="color:#0078d4; font-weight:600;">En cours...</span>`}</span>
      ${inv.stop ? `<button data-idx="${i}" class="btnDeleteInv danger" style="padding:4px 8px; font-size:12px;">Suppr</button>` : ''}
    `;
        list.appendChild(div);
    });

    if (record.intervals.length === 0) {
        list.innerHTML = '<div class="hint">Aucun intervalle enregistré.</div>';
    }

    document.querySelectorAll('.btnDeleteInv').forEach(b => {
        b.onclick = async (e) => {
            const idx = e.target.getAttribute('data-idx');
            record.intervals.splice(idx, 1);
            await saveData();
        };
    });

    const btnStart = document.getElementById("btnStartWork");
    const btnPause = document.getElementById("btnPauseWork");
    const btnFinish = document.getElementById("btnFinishWork");

    const isToday = (currentDateStr === getTodayStr());

    if (isWorking) {
        btnStart.classList.add("hidden");
        btnPause.classList.remove("hidden");
        btnFinish.classList.remove("hidden");
    } else {
        btnPause.classList.add("hidden");
        btnFinish.classList.add("hidden");
        if (isToday) {
            btnStart.classList.remove("hidden");
        } else {
            btnStart.classList.add("hidden");
        }
    }

    const totalWorked = computeDailyMinutes(record);
    let workedDisplayMins = totalWorked;

    if (isWorking && totalWorked > 0 && isToday) {
        document.getElementById("workedTimeDisplay").innerHTML = `<span style="color:#0078d4">${formatMinutes(workedDisplayMins)}</span> ✨`;
    } else {
        document.getElementById("workedTimeDisplay").innerText = formatMinutes(workedDisplayMins);
    }

    const balance = totalWorked - TARGET_MINUTES;
    const balEl = document.getElementById("dailyBalanceDisplay");
    balEl.innerText = (balance >= 0 ? "+" : "") + formatMinutes(balance);
    balEl.style.color = balance >= 0 ? "#4caf50" : "#f87171";

    const estEl = document.getElementById("estimatedEndDisplay");
    if (estEl) {
        const remMins = TARGET_MINUTES - totalWorked;
        if (isWorking && isToday && remMins > 0) {
            const now = new Date();
            const estEnd = new Date(now.getTime() + remMins * 60000);
            estEl.innerText = String(estEnd.getHours()).padStart(2, '0') + ":" + String(estEnd.getMinutes()).padStart(2, '0');
        } else if (remMins <= 0 && totalWorked > 0) {
            estEl.innerText = "Atteinte 🎉";
        } else {
            estEl.innerText = "—";
        }
    }



    renderMonthly();

    if (isWorking && !clockInterval && isToday) {
        clockInterval = setInterval(() => {
            render();
        }, 60000);
    } else if (!isWorking && clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
}

function currentHHMM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0');
}

document.getElementById("btnStartWork").onclick = async () => {
    if (currentDateStr !== getTodayStr()) return;
    const r = timeData[currentDateStr];
    if (r.intervals.some(i => !i.stop)) return;
    r.intervals.push({ start: currentHHMM(), stop: null });
    await saveData();
};

document.getElementById("btnPauseWork").onclick = async () => {
    const r = timeData[currentDateStr];
    const active = r.intervals.find(i => !i.stop);
    if (active) {
        active.stop = currentHHMM();
        await saveData();
    }
};

document.getElementById("btnFinishWork").onclick = async () => {
    const r = timeData[currentDateStr];
    const active = r.intervals.find(i => !i.stop);
    if (active) {
        active.stop = currentHHMM();
        await saveData();
    }
    // Could add visual flair or a confirmation message here
    alert("Fin de journée enregistrée !");
};

const btnAddManual = document.getElementById("btnAddManualInterval");
if (btnAddManual) {
    btnAddManual.onclick = async () => {
        const start = document.getElementById("manualStart").value;
        const end = document.getElementById("manualEnd").value;
        if (start && end) {
            timeData[currentDateStr].intervals.push({ start, stop: end });
            timeData[currentDateStr].intervals.sort((a, b) => a.start.localeCompare(b.start));
            document.getElementById("manualStart").value = "";
            document.getElementById("manualEnd").value = "";
            await saveData();
        } else {
            alert("Veuillez renseigner une heure de début et de fin.");
        }
    };
}

function renderMonthly() {
    const list = document.getElementById("monthlyView");
    list.innerHTML = "";

    const days = Object.keys(timeData)
        .filter(day => {
            const [y, m, d] = day.split('-');
            return new Date(y, m - 1, d).getDay() !== 0;
        })
        .sort().reverse();

    if (days.length === 0) {
        list.innerHTML = "<div class='hint'>Aucune donnée enregistrée.</div>";
        return;
    }

    days.forEach(day => {
        const dRec = timeData[day];
        const worked = computeDailyMinutes(dRec);
        const balance = worked - TARGET_MINUTES;
        const isToday = day === getTodayStr();
        const isSelected = day === currentDateStr;
        const color = balance >= 0 ? "#4caf50" : "#f87171";

        const div = document.createElement("div");
        div.style = `padding: 12px; border-radius: 6px; border: 1px solid ${isSelected ? '#0078d4' : '#333333'}; background: ${isSelected ? '#252526' : '#1e1e1e'}; cursor: pointer; transition: all 0.1s;`;
        div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <strong style="color: ${isToday ? '#0078d4' : ''}">${day} ${isToday ? '(Aujourd\'hui)' : ''}</strong>
        <span style="color: ${color}; font-weight:bold;">${balance >= 0 ? '+' : ''}${formatMinutes(balance)}</span>
      </div>
      <div style="font-size: 13px; opacity: 0.8;">
        Travaillé : ${formatMinutes(worked)} | Ajusté : ${dRec.manualAdjustment}m
      </div>
    `;
        div.onclick = () => {
            currentDateStr = day;
            const fmtLabel = isToday ? "Aujourd'hui" : day;
            document.getElementById("currentDateLabel").innerText = fmtLabel;
            render();
        };
        list.appendChild(div);
    });
}

document.getElementById("btnExportCSV").onclick = () => {
    let csv = "Date,WorkedMinutes,AdjustmentMinutes,BalanceMinutes\n";
    const days = Object.keys(timeData)
        .filter(day => {
            const [y, m, d] = day.split('-');
            return new Date(y, m - 1, d).getDay() !== 0;
        })
        .sort();
    days.forEach(day => {
        const worked = computeDailyMinutes(timeData[day]);
        const balance = worked - TARGET_MINUTES;
        csv += `${day},${worked},${timeData[day].manualAdjustment},${balance}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "notebox-time-export.csv";
    a.click();
};

loadData();
