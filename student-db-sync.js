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

  function saveProfile(p) {
    if (!p || !p.email) return;
    try {
      const accounts = JSON.parse(localStorage.getItem("EDSA_STUDENT_ACCOUNTS") || "{}");
      const email = String(p.email).trim().toLowerCase();
      accounts[email] = Object.assign({}, accounts[email] || {}, p);
      localStorage.setItem("EDSA_STUDENT_ACCOUNTS", JSON.stringify(accounts));
      localStorage.setItem("EDSA_ACTIVE_EMAIL", email);
      localStorage.setItem("EDSA_STUDENT_PROFILE", JSON.stringify(accounts[email]));
    } catch (_) {}
  }

  async function getServerProfile() {
    try {
      const response = await fetch("/api/auth-me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok && result.user && result.user.email) {
        saveProfile(result.user);
        return result.user;
      }
    } catch (_) {}
    return null;
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

    let p = profile();
    if (!p || !p.email) p = await getServerProfile();
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

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        console.warn("[EDSA] Student sync failed:", response.status, result.error || "Unknown error");
      }
      return response.ok;
    } catch (error) {
      console.warn("[EDSA] Student database sync unavailable:", error);
      return false;
    } finally {
      syncing = false;
    }
  }

  async function pull() {
    let p = profile();
    if (!p || !p.email) p = await getServerProfile();
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

  window.EDSA_DB_SYNC = { push, pull, syncNow };

  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      if (typeof installGoldCertificateRenderer === "function") {
        installGoldCertificateRenderer();
      }
      syncNow();
      setInterval(syncNow, 5000);
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
  // Step 12: record each completed exam in Supabase without changing payment handling.
  (function installExamAttemptRecorder() {
    let tries = 0;
    const timer = setInterval(function () {
      tries++;
      if (typeof window.startTimer === "function" && !window.__EDSA_START_TIMER_WRAPPED) {
        const originalStartTimer = window.startTimer;
        window.startTimer = function () {
          window.__EDSA_EXAM_STARTED_AT = new Date().toISOString();
          window.__EDSA_EXAM_ATTEMPT_RECORDED = false;
          return originalStartTimer.apply(this, arguments);
        };
        window.__EDSA_START_TIMER_WRAPPED = true;
      }

      if (typeof window.renderResult === "function" && !window.__EDSA_RESULT_WRAPPED) {
        const originalRenderResult = window.renderResult;
        window.renderResult = function (passed, score, correctCount) {
          const result = originalRenderResult.apply(this, arguments);
          recordExamAttempt(passed, score);
          return result;
        };
        window.__EDSA_RESULT_WRAPPED = true;
      }

      if ((window.__EDSA_START_TIMER_WRAPPED && window.__EDSA_RESULT_WRAPPED) || tries > 120) {
        clearInterval(timer);
      }
    }, 100);

    async function recordExamAttempt(passed, score) {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("test") === "certificate") return;
      } catch (_) {}

      if (window.__EDSA_EXAM_ATTEMPT_RECORDED) return;
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore)) return;

      const courseTitle = String(
        (document.getElementById("examCourseTitle") || {}).innerText || ""
      ).trim();
      if (!courseTitle) return;

      window.__EDSA_EXAM_ATTEMPT_RECORDED = true;
      const completedAt = new Date().toISOString();
      const startedAt = window.__EDSA_EXAM_STARTED_AT || completedAt;

      try {
        const response = await fetch("/api/exam-attempt", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseTitle,
            score: numericScore,
            passed: !!passed,
            startedAt,
            completedAt
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          window.__EDSA_EXAM_ATTEMPT_RECORDED = false;
          console.warn("[EDSA] Exam attempt sync failed:", response.status, result.error || "Unknown error");
        } else {
          console.log("[EDSA] Exam attempt saved:", result.attempt && result.attempt.id);
        }
      } catch (error) {
        window.__EDSA_EXAM_ATTEMPT_RECORDED = false;
        console.warn("[EDSA] Exam attempt sync unavailable:", error);
      }
    }
  })();

})();
