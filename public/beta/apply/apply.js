(function () {
  const form = document.getElementById("beta-apply-form");
  if (!form) return;

  const statusEl = document.getElementById("beta-apply-status");
  const submitButton = form.querySelector('button[type="submit"]');
  const emailInput = document.getElementById("beta-apply-email");
  const displayNameInput = document.getElementById("beta-apply-display-name");
  const notesInput = document.getElementById("beta-apply-notes");
  const websiteInput = document.getElementById("beta-apply-website");
  const notesCount = document.getElementById("beta-apply-notes-count");
  const apiUrl = form.dataset.apiUrl;
  const maxNotesLength = Number(notesInput?.getAttribute("maxlength") || 4000);
  let isSubmitting = false;

  const fields = {
    email: {
      input: emailInput,
      error: document.getElementById("beta-apply-email-error"),
      wrapper: emailInput?.closest(".field"),
    },
    displayName: {
      input: displayNameInput,
      error: document.getElementById("beta-apply-display-name-error"),
      wrapper: displayNameInput?.closest(".field"),
    },
    notes: {
      input: notesInput,
      error: document.getElementById("beta-apply-notes-error"),
      wrapper: notesInput?.closest(".field"),
    },
  };

  function trimValue(input) {
    return String(input?.value || "").trim();
  }

  function setStatus(message, state) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = state || "";
  }

  function setFieldError(fieldName, message) {
    const field = fields[fieldName];
    if (!field) return;
    if (field.error) field.error.textContent = message || "";
    if (field.wrapper) field.wrapper.dataset.invalid = message ? "true" : "false";
    field.input?.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function clearFieldErrors() {
    Object.keys(fields).forEach((fieldName) => setFieldError(fieldName, ""));
  }

  function updateNotesCount() {
    if (!notesCount || !notesInput) return;
    notesCount.textContent = `${notesInput.value.length} / ${maxNotesLength} 文字`;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
  }

  function validate() {
    const errors = {};
    const email = trimValue(emailInput);
    const displayName = trimValue(displayNameInput);
    const notes = trimValue(notesInput);

    if (!email) {
      errors.email = "メールアドレスを入力してください。";
    } else if (email.length > 320) {
      errors.email = "メールアドレスは320文字以内で入力してください。";
    } else if (!validateEmail(email)) {
      errors.email = "メールアドレスの形式を確認してください。";
    }

    if (displayName.length > 200) {
      errors.displayName = "DisplayNameは200文字以内で入力してください。";
    }

    if (notes.length > maxNotesLength) {
      errors.notes = `Notesは${maxNotesLength}文字以内で入力してください。`;
    }

    return { ok: Object.keys(errors).length === 0, errors };
  }

  function setSubmitting(nextState) {
    isSubmitting = nextState;
    form.setAttribute("aria-busy", nextState ? "true" : "false");
    if (!submitButton) return;
    submitButton.disabled = nextState;
    submitButton.setAttribute("aria-busy", nextState ? "true" : "false");
    submitButton.textContent = nextState ? "送信中…" : "ベータテスターに応募する";
  }

  function focusFirstInvalidField() {
    const firstInvalid = form.querySelector('[aria-invalid="true"]');
    if (firstInvalid && typeof firstInvalid.focus === "function") {
      firstInvalid.focus();
      return;
    }
    emailInput?.focus();
  }

  const submitFailureMessage = "応募を送信できませんでした。時間をおいて再度お試しください。";

  emailInput?.addEventListener("input", () => {
    setFieldError("email", "");
    setStatus("", "");
  });
  displayNameInput?.addEventListener("input", () => setFieldError("displayName", ""));
  notesInput?.addEventListener("input", () => {
    setFieldError("notes", "");
    updateNotesCount();
  });

  clearFieldErrors();
  updateNotesCount();
  setStatus("", "");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (emailInput) emailInput.value = trimValue(emailInput);
    if (displayNameInput) displayNameInput.value = trimValue(displayNameInput);
    if (notesInput) notesInput.value = trimValue(notesInput);
    clearFieldErrors();
    setStatus("", "");

    const validation = validate();
    if (!validation.ok) {
      Object.entries(validation.errors).forEach(([fieldName, message]) => setFieldError(fieldName, message));
      setStatus("入力内容をご確認ください。", "error");
      focusFirstInvalidField();
      return;
    }

    const payload = {
      email: trimValue(emailInput),
      displayName: trimValue(displayNameInput) || null,
      notes: trimValue(notesInput) || null,
      website: websiteInput?.value || "",
    };

    setSubmitting(true);
    setStatus("送信中…", "");

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        console.error("[beta-apply-submit-error]", { httpStatus: response.status });
        setStatus(submitFailureMessage, "error");
        if (response.status === 400) focusFirstInvalidField();
        return;
      }

      form.reset();
      clearFieldErrors();
      updateNotesCount();
      setStatus(
        data.alreadyExists
          ? "このメールアドレスの応募は受付済みです。内容を確認後、利用方法をご案内します。"
          : "ベータテスターへのご応募ありがとうございます。内容を確認後、利用方法をご案内します。",
        "success"
      );
      statusEl?.focus();
    } catch {
      console.error("[beta-apply-submit-error]", { httpStatus: null });
      setStatus(submitFailureMessage, "error");
    } finally {
      setSubmitting(false);
    }
  });
})();
