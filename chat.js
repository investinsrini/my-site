(function () {
  'use strict';

  // ── Shared refs ───────────────────────────────────────────
  const launchers      = document.getElementById('chat-launchers');
  const qaPanel        = document.getElementById('qa-panel');
  const proposalPanel  = document.getElementById('proposal-panel');

  if (!launchers || !qaPanel || !proposalPanel) return;

  // ── Shared helpers ────────────────────────────────────────
  function showLaunchers() { launchers.classList.remove('launchers-hidden'); }
  function hideLaunchers() { launchers.classList.add('launchers-hidden'); }

  function scrollBottom(msgList) {
    requestAnimationFrame(() => { msgList.scrollTop = msgList.scrollHeight; });
  }

  function addMsg(msgList, text, role) {
    const wrap   = document.createElement('div');
    wrap.className = `chat-msg chat-msg--${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    msgList.appendChild(wrap);
    scrollBottom(msgList);
    return wrap;
  }

  function showTyping(msgList, id) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg chat-msg--bot';
    wrap.id = id;
    wrap.innerHTML = '<div class="chat-bubble chat-typing-indicator"><span></span><span></span><span></span></div>';
    msgList.appendChild(wrap);
    scrollBottom(msgList);
  }

  function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function lockInput(input, send) {
    input.disabled = true;
    send.disabled  = true;
  }

  function unlockInput(input, send) {
    input.disabled = false;
    send.disabled  = false;
    input.focus();
  }

  // Close both panels on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (qaOpen)       closeQA();
      if (proposalOpen) closeProposal();
    }
  });


  // ══════════════════════════════════════════════════════════
  // Q&A WIDGET
  // ══════════════════════════════════════════════════════════

  const qaLaunch   = document.getElementById('qa-launch');
  const qaClose    = document.getElementById('qa-close');
  const qaInput    = document.getElementById('qa-input');
  const qaSend     = document.getElementById('qa-send');
  const qaMessages = document.getElementById('qa-messages');

  let qaOpen    = false;
  let qaWaiting = false;

  function openQA() {
    qaOpen = true;
    hideLaunchers();
    qaPanel.classList.add('is-open');
    qaPanel.setAttribute('aria-hidden', 'false');
    scrollBottom(qaMessages);
    setTimeout(() => qaInput.focus(), 180);
  }

  function closeQA() {
    qaOpen = false;
    qaPanel.classList.remove('is-open');
    qaPanel.setAttribute('aria-hidden', 'true');
    showLaunchers();
  }

  qaLaunch.addEventListener('click', openQA);
  qaClose.addEventListener('click', closeQA);

  async function qaSend_message() {
    const text = qaInput.value.trim();
    if (!text || qaWaiting) return;

    qaInput.value = '';
    qaWaiting = true;
    lockInput(qaInput, qaSend);
    addMsg(qaMessages, text, 'user');
    showTyping(qaMessages, 'qa-typing');

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text })
      });
      let data;
      try { data = await res.json(); } catch { throw new Error('Invalid JSON from server'); }
      removeTyping('qa-typing');
      addMsg(qaMessages,
        (res.ok && data.reply) ? data.reply : "Something went wrong on my end. Try the contact form instead.",
        'bot');
    } catch (err) {
      console.error('QA error:', err);
      removeTyping('qa-typing');
      addMsg(qaMessages, "Couldn't connect. Use the contact form on this page.", 'bot');
    } finally {
      qaWaiting = false;
      unlockInput(qaInput, qaSend);
    }
  }

  qaSend.addEventListener('click', qaSend_message);
  qaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); qaSend_message(); }
  });


  // ══════════════════════════════════════════════════════════
  // PROPOSAL WIDGET
  // ══════════════════════════════════════════════════════════

  const proposalLaunch   = document.getElementById('proposal-launch');
  const proposalCloseBtn = document.getElementById('proposal-close');
  const proposalInput    = document.getElementById('proposal-input');
  const proposalSendBtn  = document.getElementById('proposal-send');
  const proposalMessages = document.getElementById('proposal-messages');
  const progressFill     = document.getElementById('proposal-progress-fill');
  const progressLabel    = document.getElementById('proposal-progress-label');

  let proposalOpen    = false;
  let proposalWaiting = false;
  let proposalStarted = false;
  let proposalDone    = false;
  let history         = []; // full conversation for multi-turn context

  function openProposal() {
    proposalOpen = true;
    hideLaunchers();
    proposalPanel.classList.add('is-open');
    proposalPanel.setAttribute('aria-hidden', 'false');
    scrollBottom(proposalMessages);
    if (!proposalStarted) {
      proposalStarted = true;
      setTimeout(proposalAutoStart, 350);
    } else {
      setTimeout(() => { if (!proposalDone) proposalInput.focus(); }, 180);
    }
  }

  function closeProposal() {
    proposalOpen = false;
    proposalPanel.classList.remove('is-open');
    proposalPanel.setAttribute('aria-hidden', 'true');
    showLaunchers();
  }

  proposalLaunch.addEventListener('click', openProposal);
  proposalCloseBtn.addEventListener('click', closeProposal);

  function updateProgress(step) {
    const pct = Math.round((step / 6) * 100);
    progressFill.style.width = pct + '%';
    progressLabel.textContent = 'Step ' + step + ' of 6';
  }

  // Auto-send the intake trigger on first open
  async function proposalAutoStart() {
    if (proposalWaiting) return;
    proposalWaiting = true;
    lockInput(proposalInput, proposalSendBtn);
    showTyping(proposalMessages, 'proposal-typing');

    const trigger = 'begin';
    history = [{ role: 'user', content: trigger }];

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: trigger, history, intake: true })
      });
      let data;
      try { data = await res.json(); } catch { throw new Error('Invalid JSON'); }
      removeTyping('proposal-typing');

      if (res.ok && data.reply) {
        addMsg(proposalMessages, data.reply, 'bot');
        history.push({ role: 'assistant', content: data.reply });
        if (data.intake_step) updateProgress(data.intake_step);
      } else {
        addMsg(proposalMessages, "Something went wrong. Try the contact form instead.", 'bot');
        proposalDone = true;
      }
    } catch (err) {
      console.error('Proposal auto-start error:', err);
      removeTyping('proposal-typing');
      addMsg(proposalMessages, "Couldn't connect. Use the contact form on this page.", 'bot');
    } finally {
      proposalWaiting = false;
      if (!proposalDone) unlockInput(proposalInput, proposalSendBtn);
    }
  }

  async function proposalSend_message() {
    if (proposalDone || proposalWaiting) return;
    const text = proposalInput.value.trim();
    if (!text) return;

    proposalInput.value = '';
    proposalWaiting = true;
    lockInput(proposalInput, proposalSendBtn);
    addMsg(proposalMessages, text, 'user');
    history.push({ role: 'user', content: text });
    showTyping(proposalMessages, 'proposal-typing');

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, history, intake: true })
      });
      let data;
      try { data = await res.json(); } catch { throw new Error('Invalid JSON'); }
      removeTyping('proposal-typing');

      if (res.ok && data.reply) {
        addMsg(proposalMessages, data.reply, 'bot');
        history.push({ role: 'assistant', content: data.reply });

        if (data.intake_complete) {
          updateProgress(6);
          proposalDone = true;
          // Permanently lock input on completion
          lockInput(proposalInput, proposalSendBtn);
          proposalInput.placeholder = 'Intake complete';
          // Fire-and-forget: send to generate-proposal stub
          fetch('/api/generate-proposal', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ intake_data: data.intake_data, conversation: history })
          }).catch((err) => console.error('generate-proposal error:', err));
        } else if (data.intake_step) {
          updateProgress(data.intake_step);
        }
      } else {
        addMsg(proposalMessages, "Something went wrong. Try the contact form instead.", 'bot');
      }
    } catch (err) {
      console.error('Proposal error:', err);
      removeTyping('proposal-typing');
      addMsg(proposalMessages, "Couldn't connect. Use the contact form on this page.", 'bot');
    } finally {
      proposalWaiting = false;
      if (!proposalDone) unlockInput(proposalInput, proposalSendBtn);
    }
  }

  proposalSendBtn.addEventListener('click', proposalSend_message);
  proposalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); proposalSend_message(); }
  });

})();
