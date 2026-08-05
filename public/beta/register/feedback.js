(function () {
  const form = document.getElementById("feedback-form");
  if (!form) {
    return;
  }

  const statusEl = document.getElementById("form-status");
  const submitButton = form.querySelector('button[type="submit"]');
  const nameInput = document.getElementById("feedback-name");
  const emailInput = document.getElementById("feedback-email");
  const categorySelect = document.getElementById("feedback-category");
  const messageInput = document.getElementById("feedback-message");
  const companyInput = document.getElementById("feedback-company");
  const startedAtInput = document.getElementById("feedback-started-at");
  const pageVersionInput = document.getElementById("feedback-page-version");
  const messageCount = document.getElementById("feedback-message-count");

  const fields = {
    name: {
      input: nameInput,
      error: document.getElementById("feedback-name-error"),
      wrapper: nameInput?.closest(".field"),
    },
    email: {
      input: emailInput,
      error: document.getElementById("feedback-email-error"),
      wrapper: emailInput?.closest(".field"),
    },
    category: {
      input: categorySelect,
      error: document.getElementById("feedback-category-error"),
      wrapper: categorySelect?.closest(".field"),
    },
    message: {
      input: messageInput,
      error: document.getElementById("feedback-message-error"),
      wrapper: messageInput?.closest(".field"),
    },
  };

  const defaultCategory = categorySelect ? categorySelect.value : "ご感想";
  const startedAt = new Date();
  const maxMessageLength = Number(messageInput?.getAttribute("maxlength") || 2000);
  let isSubmitting = false;

  if (startedAtInput) {
    startedAtInput.value = startedAt.toISOString();
  }

  function setStatus(message, state) {
    if (!statusEl) {
      return;
    }

    statusEl.textContent = message;
    statusEl.dataset.state = state || "";
  }

  function clearStatus() {
    setStatus("", "");
  }

  function setFieldError(fieldName, message) {
    const field = fields[fieldName];
    if (!field) {
      return;
    }

    if (field.error) {
      field.error.textContent = message || "";
    }

    if (field.wrapper) {
      field.wrapper.dataset.invalid = message ? "true" : "false";
    }

    if (field.input) {
      field.input.setAttribute("aria-invalid", message ? "true" : "false");
    }
  }

  function clearFieldErrors() {
    Object.keys(fields).forEach((key) => setFieldError(key, ""));
  }

  function updateMessageCount() {
    if (!messageCount || !messageInput) {
      return;
    }

    const length = messageInput.value.length;
    messageCount.textContent = `${length} / ${maxMessageLength} 文字`;
  }

  function trimValue(input) {
    return String(input?.value || "").trim();
  }

  function validateEmail(email) {
    if (!email) {
      return true;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
  }

  function validate() {
    const errors = {};
    const name = trimValue(nameInput);
    const email = trimValue(emailInput);
    const category = trimValue(categorySelect);
    const message = String(messageInput?.value || "").trim();
    const company = trimValue(companyInput);
    const startedAtValue = String(startedAtInput?.value || "");

    if (company) {
      errors._honeypot = true;
      return { ok: false, errors };
    }

    if (name.length > 100) {
      errors.name = "お名前は100文字以内で入力してください。";
    }

    if (email.length > 254) {
      errors.email = "メールアドレスは254文字以内で入力してください。";
    } else if (!validateEmail(email)) {
      errors.email = "メールアドレスの形式を確認してください。";
    }

    if (!category) {
      errors.category = "メッセージの種類を選択してください。";
    }

    if (!message) {
      errors.message = "メッセージを入力してください。";
    } else if (message.length > maxMessageLength) {
      errors.message = "メッセージは2000文字以内で入力してください。";
    }

    const formStartedAt = Date.parse(startedAtValue);
    if (!Number.isFinite(formStartedAt) || Date.now() - formStartedAt < 1000) {
      errors._timing = true;
      return { ok: false, errors };
    }

    return { ok: Object.keys(errors).length === 0, errors };
  }

  function focusFirstInvalidField() {
    const firstInvalid = form.querySelector('[aria-invalid="true"]');
    if (firstInvalid && typeof firstInvalid.focus === "function") {
      firstInvalid.focus();
    }
  }

  function setSubmitting(nextState) {
    isSubmitting = nextState;
    if (submitButton) {
      submitButton.disabled = nextState;
      submitButton.textContent = nextState ? "送信中…" : "メッセージを送信する";
    }
  }

  function resetAfterSuccess() {
    form.reset();
    if (categorySelect) {
      categorySelect.value = defaultCategory;
    }
    if (startedAtInput) {
      startedAtInput.value = new Date().toISOString();
    }
    clearFieldErrors();
    clearStatus();
    updateMessageCount();
  }

  function applyServerErrors(fieldErrors) {
    clearFieldErrors();

    if (!fieldErrors) {
      return;
    }

    Object.entries(fieldErrors).forEach(([key, value]) => {
      if (fields[key]) {
        setFieldError(key, value);
      }
    });
  }

  messageInput?.addEventListener("input", () => {
    updateMessageCount();
    setFieldError("message", "");
    clearStatus();
  });

  nameInput?.addEventListener("input", () => {
    setFieldError("name", "");
  });

  emailInput?.addEventListener("input", () => {
    setFieldError("email", "");
  });

  categorySelect?.addEventListener("change", () => {
    setFieldError("category", "");
  });

  updateMessageCount();
  clearFieldErrors();
  clearStatus();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    clearStatus();
    clearFieldErrors();

    const validation = validate();
    if (!validation.ok) {
      if (validation.errors.name) setFieldError("name", validation.errors.name);
      if (validation.errors.email) setFieldError("email", validation.errors.email);
      if (validation.errors.category) setFieldError("category", validation.errors.category);
      if (validation.errors.message) setFieldError("message", validation.errors.message);

      if (validation.errors._honeypot || validation.errors._timing) {
        setStatus("メッセージを送信できませんでした。時間をおいて、もう一度お試しください。", "error");
      } else {
        setStatus("入力内容をご確認ください。", "error");
      }

      focusFirstInvalidField();
      return;
    }

    const payload = {
      name: trimValue(nameInput),
      email: trimValue(emailInput),
      category: trimValue(categorySelect),
      message: String(messageInput?.value || "").trim(),
      sourcePage: window.location.href,
      pageVersion: pageVersionInput?.value || "beta-register",
      submittedAt: new Date().toISOString(),
      browser: navigator.userAgent || "",
      formStartedAt: startedAtInput?.value || "",
    };

    if (companyInput) {
      payload.company = companyInput.value || "";
    }

    setSubmitting(true);
    setStatus("送信中…", "");

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        if (response.status === 400 && data?.fieldErrors) {
          applyServerErrors(data.fieldErrors);
          setStatus("入力内容をご確認ください。", "error");
          focusFirstInvalidField();
          return;
        }

        setStatus("メッセージを送信できませんでした。時間をおいて、もう一度お試しください。", "error");
        return;
      }

      resetAfterSuccess();
      setStatus("メッセージを送信しました。釣り羅針盤へのご意見をありがとうございます。", "success");
    } catch (error) {
      setStatus("メッセージを送信できませんでした。時間をおいて、もう一度お試しください。", "error");
    } finally {
      setSubmitting(false);
    }
  });
})();
