(function () {
  'use strict';

  const client = window.bangsideSupabase;
  const $ = (id) => document.getElementById(id);

  const statusBox = $('chat-status');
  const app = $('chat-app');
  const loginPrompt = $('chat-login-prompt');
  const roomList = $('room-list');
  const messageList = $('message-list');
  const roomForm = $('room-create-form');
  const messageForm = $('message-form');
  const messageInput = $('message-input');
  const joinCallButton = $('join-live-call');
  const sendButton = $('send-message');

  let currentUser = null;
  let activeRoom = null;
  let messageChannel = null;
  let knownMessageIds = new Set();

  function setStatus(message, isError) {
    statusBox.textContent = message;
    statusBox.style.color = isError ? '#ff7777' : 'var(--gold)';
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function showLogin() {
    app.hidden = true;
    loginPrompt.hidden = false;
    setStatus('You are not signed in.', false);
  }

  function showEmptyMessages(text) {
    messageList.replaceChildren(makeElement('p', 'empty-state', text));
  }

  function stopMessageSubscription() {
    if (messageChannel) {
      client.removeChannel(messageChannel);
      messageChannel = null;
    }
  }

  function renderRoomButton(room) {
    const button = makeElement('button', 'room-item');
    button.type = 'button';
    button.setAttribute(
      'aria-pressed',
      String(Boolean(activeRoom && activeRoom.id === room.id))
    );

    button.appendChild(makeElement('span', '', room.name));
    button.appendChild(
      makeElement(
        'small',
        '',
        (room.visibility === 'public' ? 'Public' : 'Private') +
          ' · ' + (room.room_type || 'conversation')
      )
    );

    button.addEventListener('click', function () {
      openRoom(room);
    });

    return button;
  }

  async function loadRooms() {
    roomList.replaceChildren(makeElement('p', 'empty-state', 'Loading rooms…'));

    const { data, error } = await client
      .from('rooms')
      .select('id,name,description,room_type,visibility,created_by,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      roomList.replaceChildren();
      setStatus('Could not load rooms: ' + error.message, true);
      return;
    }

    roomList.replaceChildren();

    if (!data || data.length === 0) {
      roomList.appendChild(
        makeElement('p', 'empty-state', 'No rooms are visible yet. Create one to begin.')
      );
      return;
    }

    data.forEach(function (room) {
      roomList.appendChild(renderRoomButton(room));
    });

    if (activeRoom) {
      const updatedRoom = data.find((room) => room.id === activeRoom.id);
      if (updatedRoom) {
        activeRoom = updatedRoom;
        updateRoomSelection();
      } else {
        activeRoom = null;
        stopMessageSubscription();
        messageInput.disabled = true;
        sendButton.disabled = true;
        showEmptyMessages('That room is no longer available to your account.');
      }
    }
  }

  function updateRoomSelection() {
    roomList.querySelectorAll('.room-item').forEach(function (button) {
      const title = button.querySelector('span');
      button.setAttribute(
        'aria-pressed',
        String(Boolean(activeRoom && title && title.textContent === activeRoom.name))
      );
    });
  }

  function renderMessage(message) {
    if (!message || knownMessageIds.has(message.id)) return;
    knownMessageIds.add(message.id);

    const empty = messageList.querySelector('.empty-state');
    if (empty) messageList.replaceChildren();

    const own = message.sender_id === currentUser.id;
    const article = makeElement(
      'article',
      'message' + (own ? ' own-message' : '')
    );

    const meta = makeElement('div', 'message-meta');
    meta.appendChild(makeElement('span', '', own ? 'You' : 'Member'));

    if (message.created_at) {
      const time = new Date(message.created_at);
      if (!Number.isNaN(time.getTime())) {
        meta.appendChild(
          makeElement('time', '', time.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          }))
        );
      }
    }

    article.appendChild(meta);
    article.appendChild(makeElement('div', 'message-body', message.body || ''));
    messageList.appendChild(article);
    messageList.scrollTop = messageList.scrollHeight;
  }

  async function loadMessages(room) {
    stopMessageSubscription();
    knownMessageIds = new Set();
    showEmptyMessages('Loading messages…');

    const { data, error } = await client
      .from('room_messages')
      .select('id,room_id,sender_id,body,message_type,created_at')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      showEmptyMessages('Messages could not be loaded.');
      setStatus('Could not load messages: ' + error.message, true);
      return;
    }

    showEmptyMessages(
      data && data.length ? '' : 'No messages yet. Start the conversation.'
    );

    if (data) data.forEach(renderMessage);

    messageChannel = client
      .channel('room-messages-' + room.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_messages',
          filter: 'room_id=eq.' + room.id
        },
        function (payload) {
          if (activeRoom && activeRoom.id === room.id) {
            renderMessage(payload.new);
          }
        }
      )
      .subscribe(function (state) {
        if (state === 'SUBSCRIBED') {
          setStatus('Connected to room: ' + room.name, false);
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          setStatus(
            'Messages loaded, but live updates are unavailable. Check Supabase Realtime settings.',
            true
          );
        }
      });
  }

  async function openRoom(room) {
    activeRoom = room;
    joinCallButton.disabled = !currentUser;
    $('active-room-name').textContent = room.name;
    $('active-room-description').textContent =
      room.description || (room.visibility === 'public'
        ? 'Public community conversation.'
        : 'Private room.');

    messageInput.disabled = false;
    sendButton.disabled = false;
    updateRoomSelection();
    setStatus('Opening room…', false);
    await loadMessages(room);
  }

  roomForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!currentUser) return;

    const name = $('room-name').value.trim();
    const visibility = $('room-visibility').value;

    if (!name) {
      setStatus('Enter a room name first.', true);
      return;
    }

    const submitButton = roomForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const { data: room, error } = await client
        .from('rooms')
        .insert({
          name: name,
          visibility: visibility,
          room_type: 'conversation',
          created_by: currentUser.id
        })
        .select('id,name,description,room_type,visibility,created_by,created_at')
        .single();

      if (error) throw error;

      if (visibility === 'public') {
        const { error: joinError } = await client
          .from('room_members')
          .insert({
            room_id: room.id,
            user_id: currentUser.id,
            role: 'member'
          });

        if (joinError && joinError.code !== '23505') {
          setStatus(
            'Room was created, but joining it returned an error: ' + joinError.message,
            true
          );
        }
      }

      $('room-name').value = '';
      await loadRooms();
      await openRoom(room);
      setStatus('Room created: ' + room.name, false);
    } catch (error) {
      const { data: sessionData } = await client.auth.getSession();
      const sessionUserId = sessionData.session?.user?.id || null;
      const sameUser = Boolean(currentUser?.id && sessionUserId === currentUser.id);
      console.error('Room creation diagnostic', {
        currentUserPresent: Boolean(currentUser?.id),
        sessionUserMatches: sameUser,
        errorCode: error.code || null,
        errorDetails: error.details || null,
        errorHint: error.hint || null
      });
      setStatus(
        'Could not create room: ' + error.message +
        ' (session match: ' + sameUser +
        ', error code: ' + (error.code || 'none') + ')',
        true
      );
    } finally {
      submitButton.disabled = false;
    }
  });

  messageForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!currentUser || !activeRoom) return;

    const body = messageInput.value.trim();
    if (!body) return;

    sendButton.disabled = true;

    const { data, error } = await client
      .from('room_messages')
      .insert({
        room_id: activeRoom.id,
        sender_id: currentUser.id,
        body: body,
        message_type: 'text'
      })
      .select('id,room_id,sender_id,body,message_type,created_at')
      .single();

    sendButton.disabled = false;

    if (error) {
      setStatus('Message was not sent: ' + error.message, true);
      return;
    }

    messageInput.value = '';
    renderMessage(data);
    messageInput.focus();
  });

  $('refresh-rooms').addEventListener('click', loadRooms);

  const callPanel = $('live-call-panel');
  const callContainer = $('live-call-container');
  let liveCall = null;
  let localTracks = [];

  function resetCallUI(message) {
    callContainer.replaceChildren();
    callPanel.hidden = true;
    liveCall = null;
    localTracks = [];
    joinCallButton.disabled = !currentUser || !activeRoom;
    if (message) setStatus(message);
  }

  function attachTrack(track, participant, isLocal = false) {
    if (!track || !participant) return;
    const tile = document.createElement('div');
    tile.className = 'live-video-tile';
    tile.style.cssText =
      'display:inline-flex;flex-direction:column;vertical-align:top;' +
      'width:min(100%,420px);margin:8px;padding:8px;background:#171717;' +
      'border-radius:10px;color:white;gap:6px;';

    const label = document.createElement('p');
    label.textContent = (participant.name || participant.identity || 'Participant') +
      (isLocal ? ' (You)' : '');
    tile.appendChild(label);

    const media = track.attach();
    media.style.maxWidth = '100%';
    media.style.width = '100%';
    media.autoplay = true;
    if (track.kind === 'video') {
      media.playsInline = true;
      media.style.borderRadius = '8px';
      media.muted = isLocal;
      media.style.background = '#000';
    } else {
      media.controls = false;
      media.muted = isLocal;
    }
    tile.appendChild(media);
    callContainer.appendChild(tile);
  }

  function removeTrack(track) {
    if (!track) return;
    track.detach().forEach((element) => element.remove());
  }

  joinCallButton.addEventListener('click', async function () {
    if (!currentUser || !activeRoom) {
      setStatus('Sign in and select a room before joining a call.', true);
      return;
    }
    if (liveCall) {
      setStatus('You are already in the call.');
      return;
    }

    const sdk = window.LivekitClient;
    if (!sdk || !sdk.Room || !sdk.RoomEvent) {
      setStatus('LiveKit did not load. Refresh the page and try again.', true);
      return;
    }

    joinCallButton.disabled = true;
    callPanel.hidden = false;
    callContainer.replaceChildren();
    setStatus('Connecting to the live call…');

    try {
      const { data: tokenData, error: tokenError } =
        await client.functions.invoke('livekit-token', {
          body: { roomId: activeRoom.id }
        });

      if (tokenError) throw new Error(tokenError.message || 'Could not request a call token.');
      if (!tokenData?.serverUrl || !tokenData?.participantToken) {
        throw new Error(tokenData?.error || 'The call service returned an incomplete token.');
      }

      const room = new sdk.Room({
        adaptiveStream: true,
        dynacast: true
      });
      liveCall = room;

      room.on(sdk.RoomEvent.TrackSubscribed, (track, publication, participant) => {
        attachTrack(track, participant, false);
      });

      room.on(sdk.RoomEvent.TrackUnsubscribed, (track) => removeTrack(track));

      room.on(sdk.RoomEvent.ParticipantDisconnected, (participant) => {
        participant.trackPublications.forEach((publication) => {
          if (publication.track) removeTrack(publication.track);
        });
      });

      room.on(sdk.RoomEvent.Disconnected, () => {
        if (liveCall === room) resetCallUI('Disconnected from the live call.');
      });

      await room.connect(tokenData.serverUrl, tokenData.participantToken);

      const tracks = await sdk.createLocalTracks({
        audio: true,
        video: true
      });
      localTracks = tracks;

      for (const track of tracks) {
        await room.localParticipant.publishTrack(track);
        if (track.kind === 'video') {
          attachTrack(track, room.localParticipant, true);
        }
      }

      setStatus('Connected to the live call. Allow camera and microphone access if prompted.');
    } catch (error) {
      if (liveCall) {
        const failedRoom = liveCall;
        liveCall = null;
        try { await failedRoom.disconnect(); } catch (_) {}
      }
      localTracks.forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
      localTracks = [];
      callContainer.replaceChildren();
      callPanel.hidden = true;
      joinCallButton.disabled = !currentUser || !activeRoom;
      setStatus('Could not start the call: ' + (error.message || 'Unknown error'), true);
    }
  });

  $('leave-live-call').addEventListener('click', async function () {
    const room = liveCall;
    liveCall = null;
    if (room) {
      try { await room.disconnect(); } catch (_) {}
    }
    localTracks.forEach((track) => {
      try { track.stop(); } catch (_) {}
    });
    localTracks = [];
    callContainer.replaceChildren();
    callPanel.hidden = true;
    joinCallButton.disabled = !currentUser || !activeRoom;
    setStatus('You left the call.');
  });

  async function start() {
    if (!client) {
      setStatus(
        'Supabase did not initialize. Check the configuration and script loading.',
        true
      );
      return;
    }

    try {
      const { data, error } = await client.auth.getUser();

      if (error) throw error;
      currentUser = data.user;

      if (!currentUser) {
        showLogin();
        return;
      }

      loginPrompt.hidden = true;
      app.hidden = false;
      setStatus('Signed in. Loading community rooms…', false);
      await loadRooms();

      client.auth.onAuthStateChange(function (_event, session) {
        if (!session || !session.user) {
          currentUser = null;
          activeRoom = null;
          joinCallButton.disabled = true;
          stopMessageSubscription();
          app.hidden = true;
          showLogin();
        }
      });
    } catch (error) {
      setStatus('Could not verify your account: ' + error.message, true);
    }
  }

  start();
})();
