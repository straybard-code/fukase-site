(function () {
  const form = document.getElementById("feedback-form");
  if (!form) {
    return;
  }

  const statusEl = document.getElementById("form-status");
  const submitButton = form.querySelector('button[type="submit"]');
  const nameInput = document.getElementById("feedback-name");
  const emailInput = document.getElementById("feedback-email");
  const subjectSelect = document.getElementById("feedback-subject");
  const messageInput = document.getElementById("feedback-message");
  const websiteInput = document.getElementById("feedback-website");
  const messageCount = document.getElementById("feedback-message-count");
  const FEEDBACK_API_URL = form.action;

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
    subject: {
      input: subjectSelect,
      error: document.getElementById("feedback-subject-error"),
      wrapper: subjectSelect?.closest(".field"),
    },
    message: {
      input: messageInput,
      error: document.getElementById("feedback-message-error"),
      wrapper: messageInput?.closest(".field"),
    },
  };

  const defaultSubject = subjectSelect ? subjectSelect.value : "ご意見・ご要望";
  const maxMessageLength = Number(messageInput?.getAttribute("maxlength") || 5000);
  let isSubmitting = false;

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
    const subject = trimValue(subjectSelect);
    const message = String(messageInput?.value || "").trim();

    if (!name) {
      errors.name = "お名前を入力してください。";
    } else if (name.length > 100) {
      errors.name = "お名前は100文字以内で入力してください。";
    }

    if (!email) {
      errors.email = "メールアドレスを入力してください。";
    } else if (email.length > 254) {
      errors.email = "メールアドレスは254文字以内で入力してください。";
    } else if (!validateEmail(email)) {
      errors.email = "メールアドレスの形式を確認してください。";
    }

    if (!subject) {
      errors.subject = "種別を選択してください。";
    }

    if (!message) {
      errors.message = "メッセージを入力してください。";
    } else if (message.length > maxMessageLength) {
      errors.message = `メッセージは${maxMessageLength}文字以内で入力してください。`;
    }

    return { ok: Object.keys(errors).length === 0, errors };
  }

  function focusFirstInvalidField() {
    const firstInvalid = form.querySelector('[aria-invalid="true"]');
    if (firstInvalid && typeof firstInvalid.focus === "function") {
      firstInvalid.focus();
      return;
    }

    nameInput?.focus();
  }

  function setSubmitting(nextState) {
    isSubmitting = nextState;
    form.setAttribute("aria-busy", nextState ? "true" : "false");
    if (submitButton) {
      submitButton.disabled = nextState;
      submitButton.setAttribute("aria-busy", nextState ? "true" : "false");
      submitButton.textContent = nextState ? "送信中..." : "送信する";
    }
  }

  function getFailureMessage(response, data) {
    if (data?.message) {
      return data.message;
    }

    if (response.status === 400) {
      return "入力内容を確認してください。";
    }

    if (response.status === 403) {
      return "このページからはお問い合わせを送信できません。";
    }

    if (response.status === 429) {
      return "送信回数が上限に達しました。時間をおいてから再度お試しください。";
    }

    return "送信結果を確認できませんでした。時間をおいて再度お試しください。";
  }

  function resetAfterSuccess() {
    form.reset();
    if (subjectSelect) {
      subjectSelect.value = defaultSubject;
    }
    clearFieldErrors();
    clearStatus();
    updateMessageCount();
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

  subjectSelect?.addEventListener("change", () => {
    setFieldError("subject", "");
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

    if (nameInput) nameInput.value = trimValue(nameInput);
    if (emailInput) emailInput.value = trimValue(emailInput);
    if (subjectSelect) subjectSelect.value = trimValue(subjectSelect);
    if (messageInput) messageInput.value = String(messageInput.value || "").trim();

    const validation = validate();
    if (!validation.ok) {
      if (validation.errors.name) setFieldError("name", validation.errors.name);
      if (validation.errors.email) setFieldError("email", validation.errors.email);
      if (validation.errors.subject) setFieldError("subject", validation.errors.subject);
      if (validation.errors.message) setFieldError("message", validation.errors.message);

      setStatus("入力内容をご確認ください。", "error");
      focusFirstInvalidField();
      return;
    }

    const payload = {
      name: trimValue(nameInput),
      email: trimValue(emailInput),
      subject: trimValue(subjectSelect),
      message: String(messageInput?.value || "").trim(),
      source: "landing-page",
      website: websiteInput?.value || "",
    };

    setSubmitting(true);
    setStatus("送信中…", "");

    try {
      const response = await fetch(FEEDBACK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        console.error("[feedback-submit-error]", {
          httpStatus: response.status,
          errorCode: data?.errorCode || null,
          requestId: data?.requestId || null,
        });
        setStatus(getFailureMessage(response, data), "error");
        if (response.status === 400) {
          focusFirstInvalidField();
        }
        return;
      }

      resetAfterSuccess();
      setStatus(data.message || "お問い合わせを受け付けました。", "success");
    } catch (error) {
      console.error("[feedback-submit-error]", {
        httpStatus: null,
        errorCode: null,
        requestId: null,
      });
      setStatus("送信に失敗しました。通信状態を確認して、時間をおいて再度お試しください。", "error");
    } finally {
      setSubmitting(false);
    }
  });
})();
