/* EDSA Step 12 — server-backed student database bridge */
(function () {
  "use strict";

  const JOURNEY_KEY = "EDSA_STUDENT_JOURNEY";
  const CERT_KEY = "EDSA_CERTIFICATES";
  let syncing = false;

  function profile() {
    try {
      const accounts = JSON.parse(localStorage.getItem("EDSA_STUDENT_ACCOUNTS") || "{}");
      const active = String(localStorage.getItem("EDSA_ACTIVE_EMAIL") || "").toLowerCase();
      if (active && accounts[active]) return accounts[active];
      const legacy = JSON.parse(localStorage.getItem("EDSA_STUDENT_PROFILE") || "null");
      return legacy && legacy.email ? legacy : null;
    } catch (_) {
      return null;
    }
  }

  function journey() {
    try {
      const value = JSON.parse(localStorage.getItem(JOURNEY_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_) { return {}; }
  }

  function certificates() {
    try {
      const value = JSON.parse(localStorage.getItem(CERT_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_) { return {}; }
  }

  function saveJourney(value) {
    localStorage.setItem(JOURNEY_KEY, JSON.stringify(value));
  }

  function saveCertificates(value) {
    localStorage.setItem(CERT_KEY, JSON.stringify(value));
  }

  async function push() {
    if (syncing) return false;
    const p = profile();
    if (!p || !p.email) return false;

    syncing = true;
    try {
      const response = await fetch("/api/student-sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: p,
          journey: journey(),
          certificates: certificates()
        })
      });
      return response.ok;
    } catch (error) {
      console.warn("[EDSA] Student database sync unavailable:", error);
      return false;
    } finally {
      syncing = false;
    }
  }

  async function pull() {
    const p = profile();
    if (!p || !p.email) return false;

    try {
      const response = await fetch("/api/student-sync", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.student) return false;

      const email = String(result.student.email || p.email).toLowerCase();
      const allJourney = journey();
      const localStudent = allJourney[email] || { courses: {} };
      localStudent.courses = localStudent.courses || {};

      (result.progress || []).forEach(function (row) {
        const current = localStudent.courses[row.course_id] || {};
        localStudent.courses[row.course_id] = Object.assign({}, current, {
          courseTitle: row.course_title,
          attempts: Number(row.attempts || 0),
          status: row.passed ? "passed" : (row.latest_status || current.status || "not-started"),
          bestScore: row.best_score,
          lastScore: row.latest_score,
          lastAttempt: row.last_attempt_at,
          certificateId: row.certificate_id || current.certificateId || null
        });
      });

      allJourney[email] = localStudent;
      saveJourney(allJourney);

      const localCerts = certificates();
      (result.certificates || []).forEach(function (row) {
        localCerts[row.certificate_id] = Object.assign({}, localCerts[row.certificate_id] || {}, {
          id: row.certificate_id,
          name: row.student_name,
          courseId: row.course_id,
          course: row.course_title,
          score: row.score,
          issueDate: row.issue_date,
          status: row.status,
          verificationUrl: row.verification_url,
          issuedBy: row.issued_by
        });
      });
      saveCertificates(localCerts);
      return true;
    } catch (error) {
      console.warn("[EDSA] Student database pull unavailable:", error);
      return false;
    }
  }

  async function syncNow() {
    const ok = await push();
    if (ok) await pull();
    return ok;
  }

  /*
   * EDSA branded certificate renderer.
   * The certificate keeps the existing layout, QR verification and PDF/PNG
   * pipeline, but restores the agreed dark-navy + gold academy branding.
   */
  function installGoldCertificateRenderer() {
    if (!document.getElementById("certCanvas")) return;
    if (typeof window.drawCertificateCanvas !== "function") return;

    window.drawCertificateCanvas = function (callback) {
      const canvas = document.getElementById("certCanvas");
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      const W = 1200;
      const H = 850;
      canvas.width = W;
      canvas.height = H;

      if (!state.certificateId) {
        state.certificateId = "EDSA-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6);
      }
      if (!state.certificateIssueDate) {
        state.certificateIssueDate = new Date().toISOString().slice(0, 10);
      }

      const certId = state.certificateId;
      const dateStr = new Date(state.certificateIssueDate + "T00:00:00")
        .toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        });

      const navy = "#0B132B";
      const navy2 = "#111C3A";
      const gold = "#D4AF37";
      const goldLight = "#F2D675";
      const white = "#F8FAFC";
      const muted = "#B7C0D4";

      // Premium dark navy background.
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#070D1E");
      bg.addColorStop(0.5, navy);
      bg.addColorStop(1, "#101A36");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Subtle inner panel.
      ctx.fillStyle = "rgba(255,255,255,0.018)";
      ctx.fillRect(58, 58, W - 116, H - 116);

      // Double gold frame.
      ctx.strokeStyle = gold;
      ctx.lineWidth = 10;
      ctx.strokeRect(28, 28, W - 56, H - 56);

      ctx.strokeStyle = goldLight;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 2;
      ctx.strokeRect(46, 46, W - 92, H - 92);
      ctx.globalAlpha = 1;

      // Decorative gold corner accents.
      ctx.strokeStyle = gold;
      ctx.lineWidth = 4;
      [[70,70,120,70],[70,70,70,120],[1130,70,1080,70],[1130,70,1130,120],
       [70,780,120,780],[70,780,70,730],[1130,780,1080,780],[1130,780,1130,730]]
        .forEach(function (p) {
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(p[2], p[3]);
          ctx.stroke();
        });

      // Academy name.
      ctx.textAlign = "center";
      ctx.fillStyle = goldLight;
      ctx.font = "bold 38px Georgia, serif";
      ctx.fillText("ETHIOPIAN DIGITAL SOCIAL MEDIA ACADEMY", 600, 165);

      // Small divider.
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(430, 190);
      ctx.lineTo(770, 190);
      ctx.stroke();

      // Main title.
      ctx.fillStyle = white;
      ctx.font = "bold 27px Georgia, serif";
      ctx.fillText("CERTIFICATE OF ACHIEVEMENT", 600, 245);

      ctx.fillStyle = muted;
      ctx.font = "20px Georgia, serif";
      ctx.fillText("This official certificate verifies that", 600, 315);

      // Student name.
      ctx.fillStyle = white;
      ctx.font = "bold 48px Georgia, serif";
      const studentName = String(state.studentName || "EDSA STUDENT").toUpperCase();
      ctx.fillText(studentName, 600, 395);

      // Gold underline beneath student name.
      const nameWidth = Math.min(ctx.measureText(studentName).width + 60, 850);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(600 - nameWidth / 2, 415);
      ctx.lineTo(600 + nameWidth / 2, 415);
      ctx.stroke();

      // Achievement text.
      ctx.fillStyle = muted;
      ctx.font = "20px Georgia, serif";
      ctx.fillText(
        "has successfully passed with a score of " + state.score + "% for",
        600,
        465
      );

      // Course.
      ctx.fillStyle = goldLight;
      ctx.font = "bold 35px Georgia, serif";
      ctx.fillText(
        state.selectedCourse && state.selectedCourse.title
          ? state.selectedCourse.title
          : "EDSA Professional Course",
        600,
        525
      );

      // Gold seal.
      const sealX = 600;
      const sealY = 650;
      const outer = 58;
      const inner = 47;

      ctx.save();
      ctx.translate(sealX, sealY);
      ctx.strokeStyle = gold;
      ctx.fillStyle = "rgba(212,175,55,0.08)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, inner, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = goldLight;
      ctx.font = "bold 13px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("EDSA", 0, -5);
      ctx.font = "10px Georgia, serif";
      ctx.fillText("VERIFIED", 0, 12);

      // Small rays around the seal.
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 64, Math.sin(a) * 64);
        ctx.lineTo(Math.cos(a) * 70, Math.sin(a) * 70);
        ctx.stroke();
      }
      ctx.restore();

      // Footer metadata.
      ctx.textAlign = "left";
      ctx.fillStyle = muted;
      ctx.font = "18px Arial, sans-serif";
      ctx.fillText("Issue Date: " + dateStr, 95, 730);
      ctx.fillText("Certificate ID: " + certId, 95, 765);

      ctx.textAlign = "right";
      ctx.fillStyle = muted;
      ctx.fillText("Director: Cherenet Molla Alem", 1105, 730);

      // QR code: verification remains the existing official /verify route.
      const qrDiv = document.getElementById("qrcode");
      if (!qrDiv) {
        if (callback) callback(certId);
        return;
      }

      qrDiv.innerHTML = "";
      new QRCode(qrDiv, {
        text: window.location.origin + "/verify?id=" + encodeURIComponent(certId),
        width: 100,
        height: 100,
        colorDark: "#111111",
        colorLight: "#FFFFFF"
      });

      setTimeout(function () {
        const qrCanvas = qrDiv.querySelector("canvas");
        if (qrCanvas) {
          // White QR plate for reliable scanning on the navy certificate.
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(545, 595, 110, 110);
          ctx.drawImage(qrCanvas, 550, 600, 100, 100);

          ctx.strokeStyle = gold;
          ctx.lineWidth = 2;
          ctx.strokeRect(545, 595, 110, 110);
        }

        if (callback) callback(certId);
      }, 300);
    };
  }

  window.EDSA_DB_SYNC = { push, pull, syncNow };

  document.addEventListener("DOMContentLoaded", function () {
    // The certificate functions are declared by edsa-app.html later in the
    // page, so install the branded renderer after the page has initialized.
    setTimeout(function () {
      installGoldCertificateRenderer();
      syncNow();
      setInterval(syncNow, 15000);
    }, 1200);
  });

  window.addEventListener("pagehide", function () {
    try {
      const p = profile();
      if (!p || !p.email || !navigator.sendBeacon) return;
      const payload = JSON.stringify({
        profile: p,
        journey: journey(),
        certificates: certificates()
      });
      navigator.sendBeacon("/api/student-sync", new Blob([payload], { type: "application/json" }));
    } catch (_) {}
  });
})();
