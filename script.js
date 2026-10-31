/* =========================================================
   AWNARA — The Advanced Personal AI Assistant
   script.js
   Vanilla JavaScript — Phase 3
   Frontend ↔ FastAPI Backend Connection
   ========================================================= */

(function () {
    "use strict";

    /* =========================================================
       1. CONFIGURATION
       ========================================================= */

    const AI_STATES = {
        IDLE: "idle",
        LISTENING: "listening",
        THINKING: "thinking",
        PROCESSING: "processing",
        EXECUTING: "executing",
        RESPONDING: "responding",
        SUCCESS: "success",
        ERROR: "error"
    };

    const API_BASE_URL = (window.AWNARA_CONFIG?.apiBaseUrl ||
        (location.protocol === "file:" ? "http://127.0.0.1:8000/api" : "/api")).replace(/\/$/, "");
    const pendingConnections = new Map();

    /* =========================================================
       2. API REQUEST HELPER
       ========================================================= */

    async function apiRequest(endpoint, options = {}) {

        const requestOptions = {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        };

        let response;

        try {

            response = await fetch(
                `${API_BASE_URL}${endpoint}`,
                { ...requestOptions, signal: options.signal || AbortSignal.timeout(30000) }
            );

        } catch (error) {

            throw new Error(
                `Cannot connect to AWNARA backend at ${API_BASE_URL}. Start the server or check config.js.`
            );

        }

        let data = {};

        try {

            data = await response.json();

        } catch (error) {

            data = {};

        }

        if (!response.ok) {

            const error = new Error(
                (Array.isArray(data.detail) ? data.detail.map(item => item.msg).join("; ") : data.detail) ||
                data.message ||
                data.error ||
                `API Error: ${response.status}`
            );
            error.status = response.status;
            throw error;

        }

        return data;

    }

    /* =========================================================
       3. CORE STATE COPY
       ========================================================= */

    const CORE_STATE_COPY = {

        idle: {
            label: "IDLE",
            description: "Ready for you"
        },

        listening: {
            label: "LISTENING",
            description: "AWNARA is listening"
        },

        thinking: {
            label: "THINKING",
            description: "Analyzing your request"
        },

        processing: {
            label: "PROCESSING",
            description: "Working through it"
        },

        executing: {
            label: "EXECUTING",
            description: "Using a tool"
        },

        responding: {
            label: "RESPONDING",
            description: "Generating a response"
        },

        success: {
            label: "SUCCESS",
            description: "Task completed"
        },

        error: {
            label: "ERROR",
            description: "Something went wrong"
        }

    };

    const ACTIVITY_COPY = {

        idle: "Waiting for input",
        listening: "Listening for voice input",
        thinking: "Analyzing request",
        processing: "Processing information",
        executing: "Using a connected tool",
        responding: "Generating response",
        success: "Task completed successfully",
        error: "An error occurred"

    };

    /* =========================================================
       4. SECTION INFORMATION
       ========================================================= */

    const SECTION_INFO = {

        chat: {
            title: "AI Chat",
            icon: "◈",
            description: "Talk with AWNARA."
        },

        memory: {
            title: "Memory",
            icon: "◌",
            description: "Short-term, long-term, and project memory."
        },

        projects: {
            title: "Projects",
            icon: "◇",
            description: "Your active projects will be tracked here."
        },

        agents: {
            title: "AI Agents",
            icon: "◎",
            description: "Specialized agents for research, coding, and planning."
        },

        tools: {
            title: "Tools",
            icon: "⌘",
            description: "Connected capabilities — web, files, code, and calculation."
        }

    };

    /* =========================================================
       5. CONSTANTS
       ========================================================= */

    const STORAGE_KEY = "awnara_frontend_state";

    const MAX_HISTORY_ITEMS = 12;

    const MAX_ACTIVITY_ITEMS = 8;

    const MOBILE_SIDEBAR_BREAKPOINT = 720;

    const MOBILE_CONTEXT_BREAKPOINT = 980;

    /* =========================================================
       6. APPLICATION STATE
       ========================================================= */

    const appState = {

        currentSection: "chat",

        currentConversation: null,

        conversations: [],

        messages: [],

        aiState: AI_STATES.IDLE,

        sidebarOpen: false,

        contextPanelOpen: true,

        focusMode: false,

        isListening: false,

        isProcessing: false,

        theme: "dark",

        selectedFiles: [],

        profileMenuOpen: false,

        coreHealth: 100,

        idCounter: 0

    };

    /* =========================================================
       7. DOM REFERENCES
       ========================================================= */

    const DOM = {};

    function cacheDom() {

        DOM.app =
            document.getElementById("app");

        DOM.body =
            document.body;

        DOM.particleField =
            document.getElementById("particleField");

        DOM.mobileOverlay =
            document.getElementById("mobileOverlay");

        DOM.mobileMenuButton =
            document.getElementById("mobileMenuButton");

        DOM.brandLink =
            document.querySelector(
                ".brand[data-navigation-target]"
            );

        DOM.topbarAiState =
            document.getElementById("topbarAiState");

        DOM.themeToggle =
            document.getElementById("themeToggle");

        DOM.contextToggle =
            document.getElementById("contextToggle");

        DOM.profileButton =
            document.getElementById("profileButton");

        DOM.profileMenu =
            document.getElementById("profileMenu");

        DOM.sidebar =
            document.getElementById("sidebar");

        DOM.newConversationButton =
            document.getElementById("newConversationButton");

        DOM.navigationItems =
            document.querySelectorAll(
                ".navigationItem[data-navigation-target]"
            );

        DOM.clearHistoryButton =
            document.getElementById("clearHistoryButton");

        DOM.conversationHistory =
            document.getElementById("conversationHistory");

        DOM.mainWorkspace =
            document.getElementById("mainWorkspace");

        DOM.workspaceTitle =
            document.getElementById("workspaceTitle");

        DOM.focusModeButton =
            document.getElementById("focusModeButton");

        DOM.chatSection =
            document.getElementById("chatSection");

        DOM.dynamicSection =
            document.getElementById("dynamicSection");

        DOM.dynamicSectionTitle =
            document.getElementById("dynamicSectionTitle");

        DOM.dynamicSectionDescription =
            document.getElementById("dynamicSectionDescription");

        DOM.awnaraCore =
            document.getElementById("awnaraCore");

        DOM.coreStateLabel =
            document.getElementById("coreStateLabel");

        DOM.coreStateDescription =
            document.getElementById("coreStateDescription");

        DOM.welcomeView =
            document.getElementById("welcomeView");

        DOM.welcomeEyebrow =
            document.querySelector(
                ".welcomeView__eyebrow"
            );

        DOM.suggestionCards =
            document.querySelectorAll(
                ".suggestionCard[data-suggestion]"
            );

        DOM.messageContainer =
            document.getElementById("messageContainer");

        DOM.aiActivityIndicator =
            document.getElementById("aiActivityIndicator");

        DOM.activityText =
            document.getElementById("activityText");

        DOM.messageForm =
            document.getElementById("messageForm");

        DOM.attachmentButton =
            document.getElementById("attachmentButton");

        DOM.messageInput =
            document.getElementById("messageInput");

        DOM.voiceButton =
            document.getElementById("voiceButton");

        DOM.sendButton =
            document.getElementById("sendButton");

        DOM.characterCounter =
            document.getElementById("characterCounter");

        DOM.contextPanel =
            document.getElementById("contextPanel");

        DOM.closeContextButton =
            document.getElementById("closeContextButton");

        DOM.contextAiStateIndicator =
            document.getElementById("contextAiStateIndicator");

        DOM.contextAiState =
            document.getElementById("contextAiState");

        DOM.toolCards =
            document.querySelectorAll(
                ".toolCard[data-tool]"
            );

        DOM.clearActivityButton =
            document.getElementById("clearActivityButton");

        DOM.activityLog =
            document.getElementById("activityLog");

        DOM.coreHealthBar =
            document.getElementById("coreHealthBar");

        DOM.coreHealthValue =
            document.getElementById("coreHealthValue");

        DOM.userMessageTemplate =
            document.getElementById("userMessageTemplate");

        DOM.aiMessageTemplate =
            document.getElementById("aiMessageTemplate");

        DOM.fileInput =
            document.getElementById("fileInput");

        DOM.filePreview =
            document.getElementById("filePreview");

        DOM.fileList =
            document.getElementById("fileList");

        DOM.clearFilesButton =
            document.getElementById("clearFilesButton");

        DOM.errorRegion =
            document.getElementById("errorRegion");

        DOM.toastContainer =
            document.getElementById("toastContainer");

        DOM.liveRegion =
            document.getElementById("liveRegion");

    }

    /* =========================================================
       8. INITIALIZATION
       ========================================================= */

    document.addEventListener(
        "DOMContentLoaded",
        initializeApplication
    );

    async function initializeApplication() {

        cacheDom();

        loadApplicationState();

        ensureInitialConversation();

        bindEventListeners();

        generateParticleField();

        updateGreeting();

        renderConversationList();

        renderMessages();

        navigateToSection(appState.currentSection);

        updateResponsiveState();

        applyPanelState();

        applyTheme();

        setCoreState(
            appState.aiState,
            {
                silent: true
            }
        );

        setCoreHealth(
            appState.coreHealth
        );

        window.addEventListener(
            "resize",
            updateResponsiveState
        );

        /*
         * Connect local conversation to backend.
         * We intentionally don't block the UI while doing this.
         */
        syncInitialConversationWithBackend().catch(error => showToast(error.message, "error"));

        console.log(
            "AWNARA initialized successfully."
        );

    }

    /* =========================================================
       9. INITIAL CONVERSATION
       ========================================================= */

    function ensureInitialConversation() {

        if (!Array.isArray(appState.conversations)) {

            appState.conversations = [];

        }

        if (!appState.conversations.length) {

            const welcomeConversation = {

                id:
                    createUniqueId(
                        "conversation"
                    ),

                backendId:
                    null,

                title:
                    "Welcome to AWNARA",

                createdAt:
                    new Date().toISOString(),

                updatedAt:
                    new Date().toISOString(),

                messages:
                    []

            };

            appState.conversations = [
                welcomeConversation
            ];

            appState.currentConversation =
                welcomeConversation.id;

            appState.messages = [];

        }

        if (!appState.currentConversation) {

            appState.currentConversation =
                appState.conversations[0].id;

        }

        const active =
            findConversation(
                appState.currentConversation
            );

        if (active) {

            appState.messages =
                Array.isArray(active.messages)
                    ? [...active.messages]
                    : [];

        } else {

            appState.currentConversation =
                appState.conversations[0].id;

            appState.messages =
                Array.isArray(
                    appState.conversations[0].messages
                )
                    ? [
                        ...appState.conversations[0].messages
                    ]
                    : [];

        }

    }

    async function syncInitialConversationWithBackend(conversation = findConversation(appState.currentConversation)) {
        if (!conversation) return;
        if (conversation.backendId) {
            try { await apiRequest(`/conversations/${encodeURIComponent(conversation.backendId)}`); return conversation.backendId; }
            catch (error) { if (error.status !== 404) throw error; conversation.backendId = null; }
        }
        if (pendingConnections.has(conversation.id)) return pendingConnections.get(conversation.id);
        const pending = (async () => {
            const result = await createBackendConversation(conversation.title || "New Conversation");
            if (!result.id) throw new Error("Backend did not return a conversation ID.");
            conversation.backendId = result.id;
            saveApplicationState();
            return result.id;
        })();
        pendingConnections.set(conversation.id, pending);
        try { return await pending; }
        finally { pendingConnections.delete(conversation.id); }
    }


    /* =========================================================
       10. EVENT LISTENERS
       ========================================================= */

    function bindEventListeners() {

        if (DOM.mobileMenuButton) {

            DOM.mobileMenuButton.addEventListener(
                "click",
                toggleSidebar
            );

        }

        if (DOM.mobileOverlay) {

            DOM.mobileOverlay.addEventListener(
                "click",
                closeMobilePanels
            );

        }

        if (DOM.brandLink) {

            DOM.brandLink.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();

                    navigateToSection(
                        "chat"
                    );

                }
            );

        }

        if (DOM.themeToggle) {

            DOM.themeToggle.addEventListener(
                "click",
                toggleTheme
            );

        }

        if (DOM.contextToggle) {

            DOM.contextToggle.addEventListener(
                "click",
                toggleContextPanel
            );

        }

        if (DOM.closeContextButton) {

            DOM.closeContextButton.addEventListener(
                "click",
                function () {

                    setContextPanel(false);

                }
            );

        }

        if (DOM.profileButton) {

            DOM.profileButton.addEventListener(
                "click",
                function (event) {

                    event.stopPropagation();

                    toggleProfileMenu();

                }
            );

        }

        document
            .querySelectorAll(
                "[data-profile-action]"
            )
            .forEach(
                function (item) {

                    item.addEventListener(
                        "click",
                        function () {

                            handleProfileAction(
                                item.dataset.profileAction
                            );

                        }
                    );

                }
            );

        DOM.navigationItems.forEach(
            function (item) {

                item.addEventListener(
                    "click",
                    function () {

                        navigateToSection(
                            item.dataset.navigationTarget
                        );

                    }
                );

            }
        );

        if (DOM.newConversationButton) {

            DOM.newConversationButton.addEventListener(
                "click",
                function () {

                    createNewConversation(
                        true
                    );

                }
            );

        }

        if (DOM.clearHistoryButton) {

            DOM.clearHistoryButton.addEventListener(
                "click",
                clearConversationHistory
            );

        }

        if (DOM.focusModeButton) {

            DOM.focusModeButton.addEventListener(
                "click",
                toggleFocusMode
            );

        }

        DOM.suggestionCards.forEach(
            function (card) {

                card.addEventListener(
                    "click",
                    function () {

                        applySuggestion(
                            card.dataset.suggestion
                        );

                    }
                );

            }
        );

        if (DOM.messageForm) {

            DOM.messageForm.addEventListener(
                "submit",
                handleComposerSubmit
            );

        }

        if (DOM.messageInput) {

            DOM.messageInput.addEventListener(
                "keydown",
                handleInputKeydown
            );

            DOM.messageInput.addEventListener(
                "input",
                handleInputChange
            );

        }

        if (DOM.voiceButton) {

            DOM.voiceButton.addEventListener(
                "click",
                toggleVoiceMode
            );

        }

        if (DOM.attachmentButton) {

            DOM.attachmentButton.addEventListener(
                "click",
                function () {

                    if (DOM.fileInput) {

                        DOM.fileInput.click();

                    }

                }
            );

        }

        if (DOM.fileInput) {

            DOM.fileInput.addEventListener(
                "change",
                handleFileSelection
            );

        }

        if (DOM.clearFilesButton) {

            DOM.clearFilesButton.addEventListener(
                "click",
                clearAllAttachments
            );

        }

        DOM.toolCards.forEach(
            function (card) {

                card.addEventListener(
                    "click",
                    function () {

                        handleToolCardClick(
                            card.dataset.tool
                        );

                    }
                );

            }
        );

        if (DOM.clearActivityButton) {

            DOM.clearActivityButton.addEventListener(
                "click",
                clearActivityLog
            );

        }

        document.addEventListener(
            "keydown",
            handleGlobalKeydown
        );

        document.addEventListener(
            "click",
            handleOutsideClick
        );

    }

    /* =========================================================
       11. PARTICLE FIELD
       ========================================================= */

    function generateParticleField() {

        if (!DOM.particleField) {

            return;

        }

        const particleCount =
            window.innerWidth < 720
                ? 18
                : 34;

        const fragment =
            document.createDocumentFragment();

        for (
            let i = 0;
            i < particleCount;
            i += 1
        ) {

            const particle =
                document.createElement(
                    "span"
                );

            const size =
                1 + Math.random() * 2;

            const top =
                Math.random() * 100;

            const left =
                Math.random() * 100;

            const duration =
                14 + Math.random() * 18;

            const delayOffset =
                Math.random() * -20;

            const opacity =
                0.15 + Math.random() * 0.35;

            particle.style.position =
                "absolute";

            particle.style.top =
                `${top}%`;

            particle.style.left =
                `${left}%`;

            particle.style.width =
                `${size}px`;

            particle.style.height =
                `${size}px`;

            particle.style.borderRadius =
                "50%";

            particle.style.background =
                "var(--color-cyan)";

            particle.style.opacity =
                String(opacity);

            particle.style.boxShadow =
                "0 0 6px var(--color-cyan)";

            particle.style.animation =
                `awnaraParticleDrift ${duration}s ease-in-out ${delayOffset}s infinite`;

            fragment.appendChild(
                particle
            );

        }

        DOM.particleField.innerHTML = "";

        DOM.particleField.appendChild(
            fragment
        );

        injectParticleKeyframes();

    }

    function injectParticleKeyframes() {

        if (
            document.getElementById(
                "awnaraParticleKeyframes"
            )
        ) {

            return;

        }

        const style =
            document.createElement(
                "style"
            );

        style.id =
            "awnaraParticleKeyframes";

        style.textContent = `

            @keyframes awnaraParticleDrift {

                0%, 100% {
                    transform: translate3d(0, 0, 0);
                }

                50% {
                    transform: translate3d(12px, -18px, 0);
                }

            }

        `;

        document.head.appendChild(
            style
        );

    }

    /* =========================================================
       12. GREETING
       ========================================================= */

    function updateGreeting() {

        if (!DOM.welcomeEyebrow) {

            return;

        }

        const hour =
            new Date().getHours();

        let greeting =
            "GOOD EVENING, ALI";

        if (hour < 5) {

            greeting =
                "GOOD NIGHT, ALI";

        } else if (hour < 12) {

            greeting =
                "GOOD MORNING, ALI";

        } else if (hour < 18) {

            greeting =
                "GOOD AFTERNOON, ALI";

        }

        DOM.welcomeEyebrow.textContent =
            greeting;

    }

    /* =========================================================
       13. NAVIGATION
       ========================================================= */

    function navigateToSection(section) {

        if (
            !section ||
            !SECTION_INFO[section]
        ) {

            return;

        }

        appState.currentSection =
            section;

        updateNavigationUI();

        if (DOM.workspaceTitle) {

            DOM.workspaceTitle.textContent =
                SECTION_INFO[section].title;

        }

        if (section === "chat") {

            showElement(
                DOM.chatSection
            );

            hideElement(
                DOM.dynamicSection
            );

            renderMessages();

        } else {

            hideElement(
                DOM.chatSection
            );

            showElement(
                DOM.dynamicSection
            );

            renderDynamicSection(
                section
            );

        }

        announce(
            `${SECTION_INFO[section].title} section opened`
        );

        if (
            isMobileWidth(
                MOBILE_SIDEBAR_BREAKPOINT
            )
        ) {

            setSidebar(false);

        }

        saveApplicationState();

    }

    function updateNavigationUI() {

        DOM.navigationItems.forEach(
            function (item) {

                const isActive =
                    item.dataset.navigationTarget ===
                    appState.currentSection;

                item.classList.toggle(
                    "navigationItem--active",
                    isActive
                );

                item.setAttribute(
                    "aria-current",
                    isActive
                        ? "page"
                        : "false"
                );

            }
        );

    }

    function renderDynamicSection(section) {

        const info =
            SECTION_INFO[section];

        if (!info) {

            return;

        }

        if (DOM.dynamicSectionTitle) {

            DOM.dynamicSectionTitle.textContent =
                info.title;

        }

        if (DOM.dynamicSectionDescription) {

            DOM.dynamicSectionDescription.textContent =
                info.description;

        }

        const icon =
            DOM.dynamicSection &&
            DOM.dynamicSection.querySelector(
                ".dynamicSection__icon"
            );

        if (icon) {

            icon.textContent =
                info.icon;

        }

    }

    /* =========================================================
       14. SIDEBAR
       ========================================================= */

    function toggleSidebar() {

        setSidebar(
            !appState.sidebarOpen
        );

    }

    function setSidebar(isOpen) {

        appState.sidebarOpen =
            Boolean(isOpen);

        if (DOM.sidebar) {

            DOM.sidebar.classList.toggle(
                "is-open",
                appState.sidebarOpen
            );

        }

        if (DOM.mobileMenuButton) {

            DOM.mobileMenuButton.setAttribute(
                "aria-expanded",
                String(
                    appState.sidebarOpen
                )
            );

        }

        updateMobileOverlay();

    }

    /* =========================================================
       15. CONTEXT PANEL
       ========================================================= */

    function toggleContextPanel() {

        setContextPanel(
            !appState.contextPanelOpen
        );

    }

    function setContextPanel(isOpen) {

        appState.contextPanelOpen =
            Boolean(isOpen);

        if (DOM.contextPanel) {

            DOM.contextPanel.classList.toggle(
                "is-open",
                appState.contextPanelOpen
            );

        }

        if (DOM.contextToggle) {

            DOM.contextToggle.setAttribute(
                "aria-expanded",
                String(
                    appState.contextPanelOpen
                )
            );

        }

        updateMobileOverlay();

        saveApplicationState();

    }

    function applyPanelState() {

        if (DOM.contextPanel) {

            DOM.contextPanel.classList.toggle(
                "is-open",
                appState.contextPanelOpen
            );

        }

        if (DOM.contextToggle) {

            DOM.contextToggle.setAttribute(
                "aria-expanded",
                String(
                    appState.contextPanelOpen
                )
            );

        }

    }

    function closeMobilePanels() {

        setSidebar(false);

        if (
            isMobileWidth(
                MOBILE_CONTEXT_BREAKPOINT
            )
        ) {

            setContextPanel(false);

        }

    }

    function updateMobileOverlay() {

        if (!DOM.mobileOverlay) {

            return;

        }

        const sidebarVisible =
            appState.sidebarOpen &&
            isMobileWidth(
                MOBILE_SIDEBAR_BREAKPOINT
            );

        const contextVisible =
            appState.contextPanelOpen &&
            isMobileWidth(
                MOBILE_CONTEXT_BREAKPOINT
            );

        DOM.mobileOverlay.classList.toggle(
            "is-active",
            sidebarVisible ||
            contextVisible
        );

    }

    /* =========================================================
       16. FOCUS MODE
       ========================================================= */

    function toggleFocusMode() {

        appState.focusMode =
            !appState.focusMode;

        if (DOM.focusModeButton) {

            DOM.focusModeButton.setAttribute(
                "aria-pressed",
                String(
                    appState.focusMode
                )
            );

        }

        if (DOM.sidebar) {

            DOM.sidebar.style.display =
                appState.focusMode
                    ? "none"
                    : "";

        }

        if (DOM.contextPanel) {

            DOM.contextPanel.style.display =
                appState.focusMode
                    ? "none"
                    : "";

        }

        showToast(
            appState.focusMode
                ? "Focus mode enabled"
                : "Focus mode disabled",
            "info"
        );

    }

    /* =========================================================
       17. PROFILE MENU
       ========================================================= */

    function toggleProfileMenu() {

        setProfileMenu(
            !appState.profileMenuOpen
        );

    }

    function setProfileMenu(isOpen) {

        appState.profileMenuOpen =
            Boolean(isOpen);

        if (DOM.profileMenu) {

            DOM.profileMenu.hidden =
                !appState.profileMenuOpen;

        }

        if (DOM.profileButton) {

            DOM.profileButton.setAttribute(
                "aria-expanded",
                String(
                    appState.profileMenuOpen
                )
            );

        }

    }

    function handleProfileAction(action) {

        setProfileMenu(false);

        if (
            action === "settings" ||
            action === "preferences"
        ) {

            showToast(
                "This module is not available yet",
                "info"
            );

        }

    }

    /* =========================================================
       18. CONVERSATION SYSTEM
       ========================================================= */

    function findConversation(id) {

        return appState.conversations.find(
            function (conversation) {

                return conversation.id === id;

            }
        ) || null;

    }

    async function createNewConversation(
        notify = true
    ) {
        if (appState.isProcessing) return null;

        try {

            /*
             * Create conversation on FastAPI first.
             */
            const backendConversation =
                await createBackendConversation(
                    "New Conversation"
                );

            const backendId =
                backendConversation.id ||
                backendConversation.conversation_id;

            if (!backendId) {

                throw new Error(
                    "Backend did not return a conversation ID."
                );

            }

            const now =
                new Date().toISOString();

            const conversation = {

                id:
                    createUniqueId(
                        "conversation"
                    ),

                backendId:
                    backendId,

                title:
                    backendConversation.title ||
                    "New Conversation",

                createdAt:
                    backendConversation.createdAt ||
                    backendConversation.created_at ||
                    now,

                updatedAt:
                    backendConversation.updatedAt ||
                    backendConversation.updated_at ||
                    now,

                messages:
                    []

            };

            if (appState.isProcessing) return null;

            appState.conversations.unshift(
                conversation
            );

            appState.currentConversation =
                conversation.id;

            appState.messages =
                [];

            navigateToSection(
                "chat"
            );

            renderMessages();

            renderConversationList();

            saveApplicationState();

            if (notify) {

                showToast(
                    "New conversation created",
                    "success"
                );

            }

            if (DOM.messageInput) {

                DOM.messageInput.focus();

            }

            return conversation;

        } catch (error) {

            console.error(
                "AWNARA: failed to create backend conversation",
                error
            );

            showToast(
                error.message ||
                "Unable to create conversation",
                "error"
            );

            return null;

        }

    }

    function loadConversation(conversationId) {
        if (appState.isProcessing) { showToast("Wait for the current reply before switching chats.", "info"); return; }

        const conversation =
            findConversation(
                conversationId
            );

        if (!conversation) {

            return;

        }

        appState.currentConversation =
            conversation.id;

        appState.messages =
            Array.isArray(
                conversation.messages
            )
                ? [
                    ...conversation.messages
                ]
                : [];

        navigateToSection(
            "chat"
        );

        renderMessages();

        renderConversationList();

        saveApplicationState();

    }

    function syncCurrentConversation() {

        const conversation =
            findConversation(
                appState.currentConversation
            );

        if (!conversation) {

            return;

        }

        conversation.messages =
            [
                ...appState.messages
            ];

        conversation.updatedAt =
            new Date().toISOString();

        const firstUserMessage =
            appState.messages.find(
                function (message) {

                    return message.role === "user";

                }
            );

        if (
            firstUserMessage &&
            conversation.title ===
            "New Conversation"
        ) {

            conversation.title =
                createConversationTitle(
                    firstUserMessage.content
                );

        }

        renderConversationList();

        saveApplicationState();

    }

    function createConversationTitle(message) {

        const clean =
            String(
                message || ""
            )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();

        if (!clean) {

            return "New Conversation";

        }

        return clean.length > 32
            ? `${clean.slice(0, 32)}…`
            : clean;

    }

    async function clearConversationHistory() {
        if (appState.isProcessing) return;
        appState.isProcessing = true;
        try {
            await apiRequest("/conversations", { method: "DELETE" });
            appState.conversations = [];
            appState.currentConversation = null;
            appState.messages = [];
            ensureInitialConversation();
            renderConversationList();
            renderMessages();
            saveApplicationState();
            showToast("Conversation history cleared from this browser and backend", "info");
        } catch (error) { showToast(error.message, "error"); }
        finally { appState.isProcessing = false; }
    }


    function renderConversationList() {

        if (!DOM.conversationHistory) {

            return;

        }

        DOM.conversationHistory.innerHTML =
            "";

        appState.conversations
            .slice(
                0,
                MAX_HISTORY_ITEMS
            )
            .forEach(
                function (conversation) {

                    const li =
                        document.createElement(
                            "li"
                        );

                    li.className =
                        "historyItem";

                    const button =
                        document.createElement(
                            "button"
                        );

                    button.type =
                        "button";

                    button.className =
                        "historyItem__button";

                    button.dataset.conversationId =
                        conversation.id;

                    if (
                        conversation.id ===
                        appState.currentConversation
                    ) {

                        button.classList.add(
                            "is-active"
                        );

                    }

                    button.innerHTML = `

                        <span
                            class="historyItem__icon"
                            aria-hidden="true"
                        >
                            ◈
                        </span>

                        <span
                            class="historyItem__content"
                        >

                            <span
                                class="historyItem__title"
                            >
                                ${escapeHTML(
                                    conversation.title ||
                                    "New Conversation"
                                )}
                            </span>

                            <time
                                class="historyItem__time"
                            >
                                ${formatRelativeTime(
                                    conversation.updatedAt
                                )}
                            </time>

                        </span>

                    `;

                    button.addEventListener(
                        "click",
                        function () {

                            loadConversation(
                                conversation.id
                            );

                        }
                    );

                    li.appendChild(
                        button
                    );

                    DOM.conversationHistory
                        .appendChild(
                            li
                        );

                }
            );

    }

    /* =========================================================
       19. MESSAGE SYSTEM
       ========================================================= */

    function handleComposerSubmit(event) {

        event.preventDefault();

        sendMessage();

    }

    function handleInputKeydown(event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey && !event.isComposing
        ) {

            event.preventDefault();

            sendMessage();

        }

    }

    function handleInputChange() {

        autoResizeInput();

        updateCharacterCounter();

    }

    async function sendMessage() {
        if (!DOM.messageInput || appState.isProcessing) return;
        const content = DOM.messageInput.value.trim();
        const files = appState.selectedFiles.map(file => ({ name: file.name, size: file.size }));
        if (!content && !files.length) return;
        const conversation = findConversation(appState.currentConversation);
        if (!conversation) return;
        appState.isProcessing = true;
        setSendEnabled(false);
        try {
            await syncInitialConversationWithBackend(conversation);
            const userMessage = { id: createUniqueId("message"), role: "user", content,
                timestamp: new Date().toISOString(), files };
            conversation.messages.push(userMessage);
            appState.messages = [...conversation.messages];
            DOM.messageInput.value = "";
            resetInputHeight();
            updateCharacterCounter();
            clearAllAttachments();
            renderMessages();
            syncCurrentConversation();
            await sendMessageToBackend(conversation.backendId, content, files);
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            appState.isProcessing = false;
            setSendEnabled(true);
        }
    }


    /* =========================================================
       20. BACKEND CONVERSATION CREATION
       ========================================================= */

    async function createBackendConversation(
        title = "New Conversation"
    ) {

        return apiRequest(
            "/conversations",
            {

                method:
                    "POST",

                body:
                    JSON.stringify({
                        title
                    })

            }
        );

    }

    /* =========================================================
       21. SEND MESSAGE TO BACKEND
       ========================================================= */

    async function sendMessageToBackend(
        conversationId,
        content,
        files = []
    ) {

        appState.isProcessing =
            true;

        setSendEnabled(
            false
        );

        try {

            if (!conversationId) {

                throw new Error(
                    "Backend conversation ID is missing."
                );

            }

            if (!content && !files.length) {

                throw new Error(
                    "Message is empty."
                );

            }

            /* -----------------------------------------
               THINKING
               ----------------------------------------- */

            setCoreState(
                AI_STATES.THINKING
            );

            toggleActivityIndicator(
                true,
                "Thinking"
            );

            adjustCoreHealth(
                -3
            );

            await delay(
                300
            );

            /* -----------------------------------------
               PROCESSING
               ----------------------------------------- */

            setCoreState(
                AI_STATES.PROCESSING
            );

            toggleActivityIndicator(
                true,
                "Processing"
            );

            adjustCoreHealth(
                -2
            );

            await delay(
                300
            );

            /* -----------------------------------------
               SEND TO FASTAPI
               ----------------------------------------- */

            const result =
                await apiRequest(
                    `/conversations/${encodeURIComponent(
                        conversationId
                    )}/messages`,
                    {

                        method:
                            "POST",

                        body:
                            JSON.stringify({

                                content:
                                    content,

                                files:
                                    files

                            })

                    }
                );

            /* -----------------------------------------
               RESPONDING
               ----------------------------------------- */

            setCoreState(
                AI_STATES.RESPONDING
            );

            toggleActivityIndicator(
                true,
                "AWNARA is responding"
            );

            await delay(
                300
            );

            /* -----------------------------------------
               RECEIVE AI MESSAGE
               ----------------------------------------- */

            const assistantMessage =
                result.aiMessage ||
                result.ai_message ||
                result.assistantMessage ||
                result.assistant_message ||
                result.message;

            if (!assistantMessage) {

                throw new Error(
                    "Invalid response received from backend."
                );

            }

            let assistantContent;

            if (
                typeof assistantMessage ===
                "string"
            ) {

                assistantContent =
                    assistantMessage;

            } else {

                assistantContent =
                    assistantMessage.content ||
                    assistantMessage.text ||
                    assistantMessage.message ||
                    "";

            }

            if (!assistantContent) {

                throw new Error(
                    "Backend returned an empty AI response."
                );

            }

            const aiMessage = {

                id:
                    (
                        typeof assistantMessage ===
                        "object"
                    )
                        ? (
                            assistantMessage.id ||
                            assistantMessage.message_id ||
                            createUniqueId(
                                "message"
                            )
                        )
                        : createUniqueId(
                            "message"
                        ),

                role:
                    "assistant",

                content:
                    assistantContent,

                timestamp:
                    (
                        typeof assistantMessage ===
                        "object"
                    )
                        ? (
                            assistantMessage.timestamp ||
                            assistantMessage.createdAt ||
                            assistantMessage.created_at ||
                            new Date().toISOString()
                        )
                        : new Date().toISOString()

            };

            appState.messages.push(
                aiMessage
            );

            renderMessages();

            syncCurrentConversation();

            /* -----------------------------------------
               SUCCESS
               ----------------------------------------- */

            toggleActivityIndicator(
                false
            );

            setCoreState(
                AI_STATES.SUCCESS
            );

            adjustCoreHealth(
                8
            );

            showToast(
                "AWNARA response received",
                "success"
            );

            await delay(
                700
            );

            setCoreState(
                AI_STATES.IDLE
            );

        } catch (error) {

            console.error(
                "AWNARA Backend Error:",
                error
            );

            toggleActivityIndicator(
                false
            );

            setCoreState(
                AI_STATES.ERROR
            );

            adjustCoreHealth(
                -10
            );

            showToast(
                error.message ||
                "Unable to connect to AWNARA backend",
                "error"
            );

            announce(
                "AWNARA backend connection failed"
            );

            await delay(
                1200
            );

            setCoreState(
                AI_STATES.IDLE
            );

        } finally {

            appState.isProcessing =
                false;

            setSendEnabled(
                true
            );

        }

    }

    /* =========================================================
       22. RENDER MESSAGES
       ========================================================= */

    function renderMessages() {

        if (!DOM.messageContainer) {

            return;

        }

        if (!appState.messages.length) {

            showElement(
                DOM.welcomeView
            );

            DOM.messageContainer.innerHTML =
                "";

            return;

        }

        hideElement(
            DOM.welcomeView
        );

        DOM.messageContainer.innerHTML =
            "";

        appState.messages.forEach(
            function (message) {

                const element =
                    createMessageElement(
                        message
                    );

                if (element) {

                    DOM.messageContainer
                        .appendChild(
                            element
                        );

                }

            }
        );

        scrollMessagesToBottom();

    }

    function createMessageElement(message) {

        const isUser =
            message.role === "user";

        const template =
            isUser
                ? DOM.userMessageTemplate
                : DOM.aiMessageTemplate;

        if (!template) {

            const fallback =
                document.createElement(
                    "article"
                );

            fallback.className =
                "message";

            fallback.textContent =
                message.content || "";

            return fallback;

        }

        const fragment =
            template.content.cloneNode(
                true
            );

        const article =
            fragment.querySelector(
                ".message"
            );

        if (!article) {

            return document.createElement(
                "article"
            );

        }

        article.dataset.messageId =
            message.id;

        const timeEl =
            fragment.querySelector(
                ".message__time"
            );

        if (timeEl) {

            const timestamp =
                message.timestamp ||
                message.created_at ||
                new Date().toISOString();

            timeEl.textContent =
                formatTime(
                    timestamp
                );

            timeEl.setAttribute(
                "datetime",
                timestamp
            );

        }

        const textEl =
            fragment.querySelector(
                ".message__text"
            );

        if (textEl) {

            textEl.textContent =
                message.content ||
                (
                    message.files &&
                    message.files.length
                        ? "Sent an attachment"
                        : ""
                );

        }

        if (
            isUser &&
            message.files &&
            message.files.length
        ) {

            const body =
                fragment.querySelector(
                    ".message__body"
                );

            const fileNote =
                document.createElement(
                    "p"
                );

            fileNote.className =
                "composerHint";

            fileNote.textContent =
                message.files
                    .map(
                        function (file) {

                            return file.name;

                        }
                    )
                    .join(", ");

            if (body) {

                body.appendChild(
                    fileNote
                );

            }

        }

        const copyButton =
            fragment.querySelector(
                '[data-action="copy"]'
            );

        if (copyButton) {

            copyButton.addEventListener(
                "click",
                function () {

                    copyMessageToClipboard(
                        message.content,
                        copyButton
                    );

                }
            );

        }

        return fragment.firstElementChild;

    }

    function copyMessageToClipboard(
        text,
        button
    ) {

        if (!navigator.clipboard) {

            showToast(
                "Clipboard access is not available",
                "error"
            );

            return;

        }

        navigator.clipboard
            .writeText(
                text || ""
            )
            .then(
                function () {

                    const original =
                        button.textContent;

                    button.textContent =
                        "Copied";

                    setTimeout(
                        function () {

                            button.textContent =
                                original;

                        },
                        1500
                    );

                }
            )
            .catch(
                function () {

                    showToast(
                        "Could not copy response",
                        "error"
                    );

                }
            );

    }

    function applySuggestion(
        suggestion
    ) {

        if (
            !suggestion ||
            !DOM.messageInput
        ) {

            return;

        }

        DOM.messageInput.value =
            suggestion;

        autoResizeInput();

        updateCharacterCounter();

        DOM.messageInput.focus();

    }

    /* =========================================================
       23. AWNARA CORE CONTROLLER
       ========================================================= */

    function setCoreState(
        state,
        options
    ) {

        const silent =
            options &&
            options.silent;

        if (!CORE_STATE_COPY[state]) {

            state =
                AI_STATES.IDLE;

        }

        appState.aiState =
            state;

        if (DOM.awnaraCore) {

            DOM.awnaraCore.dataset.state =
                state;

        }

        const copy =
            CORE_STATE_COPY[state];

        if (DOM.coreStateLabel) {

            DOM.coreStateLabel.textContent =
                copy.label;

        }

        if (DOM.coreStateDescription) {

            DOM.coreStateDescription.textContent =
                copy.description;

        }

        if (DOM.topbarAiState) {

            DOM.topbarAiState.textContent =
                state.toUpperCase();

            DOM.topbarAiState.dataset.aiState =
                state;

        }

        if (DOM.contextAiState) {

            DOM.contextAiState.textContent =
                state.toUpperCase();

            DOM.contextAiState.dataset.aiState =
                state;

        }

        if (DOM.contextAiStateIndicator) {

            const color =
                coreStateColor(
                    state
                );

            DOM.contextAiStateIndicator.style.background =
                color;

            DOM.contextAiStateIndicator.style.boxShadow =
                `0 0 8px ${color}`;

        }

        if (!silent) {

            logActivity(
                ACTIVITY_COPY[state] ||
                ACTIVITY_COPY.idle,
                state
            );

        }

    }

    function coreStateColor(
        state
    ) {

        const colors = {

            idle:
                "var(--color-primary)",

            listening:
                "var(--color-cyan)",

            thinking:
                "var(--color-purple)",

            processing:
                "var(--color-primary)",

            executing:
                "var(--color-warning)",

            responding:
                "var(--color-cyan)",

            success:
                "var(--color-success)",

            error:
                "var(--color-error)"

        };

        return colors[state] ||
            "var(--color-success)";

    }

    function toggleActivityIndicator(
        isVisible,
        label
    ) {

        if (!DOM.aiActivityIndicator) {

            return;

        }

        DOM.aiActivityIndicator.hidden =
            !isVisible;

        if (
            isVisible &&
            DOM.activityText &&
            label
        ) {

            DOM.activityText.textContent =
                label;

        }

    }

    function setCoreHealth(
        value
    ) {

        appState.coreHealth =
            Math.max(
                0,
                Math.min(
                    100,
                    Number(value) || 0
                )
            );

        if (DOM.coreHealthBar) {

            DOM.coreHealthBar.setAttribute(
                "aria-valuenow",
                String(
                    Math.round(
                        appState.coreHealth
                    )
                )
            );

        }

        const progress =
            DOM.coreHealthBar &&
            DOM.coreHealthBar.querySelector(
                ".coreHealth__progress"
            );

        if (progress) {

            progress.style.width =
                `${appState.coreHealth}%`;

        }

        if (DOM.coreHealthValue) {

            DOM.coreHealthValue.textContent =
                `${Math.round(
                    appState.coreHealth
                )}%`;

        }

    }

    function adjustCoreHealth(
        delta
    ) {

        setCoreHealth(
            appState.coreHealth +
            delta
        );

    }

    /* =========================================================
       24. ACTIVITY LOG
       ========================================================= */

    function logActivity(
        title,
        state
    ) {

        if (!DOM.activityLog) {

            return;

        }

        const li =
            document.createElement(
                "li"
            );

        li.className =
            "activityItem";

        const indicatorClass =
            state === "error"
                ? "activityItem__indicator"
                : state === "success" ||
                  state === "idle"
                    ? "activityItem__indicator activityItem__indicator--success"
                    : "activityItem__indicator activityItem__indicator--active";

        const indicator =
            document.createElement(
                "span"
            );

        indicator.className =
            indicatorClass;

        indicator.setAttribute(
            "aria-hidden",
            "true"
        );

        if (state === "error") {

            indicator.style.background =
                "var(--color-error)";

            indicator.style.boxShadow =
                "0 0 8px var(--color-error)";

        }

        const content =
            document.createElement(
                "div"
            );

        content.className =
            "activityItem__content";

        content.innerHTML = `

            <span
                class="activityItem__title"
            >
                ${escapeHTML(title)}
            </span>

            <time
                class="activityItem__time"
            >
                ${formatTime(
                    new Date().toISOString()
                )}
            </time>

        `;

        li.appendChild(
            indicator
        );

        li.appendChild(
            content
        );

        DOM.activityLog.insertBefore(
            li,
            DOM.activityLog.firstChild
        );

        while (
            DOM.activityLog.children.length >
            MAX_ACTIVITY_ITEMS
        ) {

            DOM.activityLog.removeChild(
                DOM.activityLog.lastElementChild
            );

        }

    }

    function clearActivityLog() {

        if (!DOM.activityLog) {

            return;

        }

        DOM.activityLog.innerHTML =
            "";

        logActivity(
            "Activity log cleared",
            "idle"
        );

    }

    /* =========================================================
       25. VOICE
       ========================================================= */

    function toggleVoiceMode() {
        showToast("Voice recognition is not connected in this prototype.", "info");
    }


    /* =========================================================
       26. FILE CONTROLLER
       ========================================================= */

    function handleFileSelection(
        event
    ) {

        const files = Array.from(event.target.files || []);
        if (appState.selectedFiles.length + files.length > 10 || files.some(file => file.size > 100 * 1024 * 1024)) {
            showToast("Choose up to 10 files, each no larger than 100 MB.", "error");
            event.target.value = "";
            return;
        }

        if (!files.length) {

            return;

        }

        appState.selectedFiles =
            appState.selectedFiles.concat(
                files
            );

        renderAttachmentPreview();

        showToast(
            files.length > 1
                ? `${files.length} files attached`
                : `${files[0].name} attached`,
            "success"
        );

    }

    function renderAttachmentPreview() {

        if (
            !DOM.filePreview ||
            !DOM.fileList
        ) {

            return;

        }

        if (
            !appState.selectedFiles.length
        ) {

            DOM.filePreview.hidden =
                true;

            DOM.fileList.innerHTML =
                "";

            return;

        }

        DOM.filePreview.hidden =
            false;

        DOM.fileList.innerHTML =
            "";

        appState.selectedFiles.forEach(
            function (
                file,
                index
            ) {

                const li =
                    document.createElement(
                        "li"
                    );

                li.style.display =
                    "flex";

                li.style.alignItems =
                    "center";

                li.style.gap =
                    "8px";

                li.style.padding =
                    "6px 4px";

                li.style.fontSize =
                    "0.72rem";

                li.style.color =
                    "var(--color-text-secondary)";

                const icon =
                    document.createElement(
                        "span"
                    );

                icon.setAttribute(
                    "aria-hidden",
                    "true"
                );

                icon.textContent =
                    "⌁";

                const name =
                    document.createElement(
                        "span"
                    );

                name.style.flex =
                    "1";

                name.style.overflow =
                    "hidden";

                name.style.textOverflow =
                    "ellipsis";

                name.style.whiteSpace =
                    "nowrap";

                name.textContent =
                    file.name;

                const removeButton =
                    document.createElement(
                        "button"
                    );

                removeButton.type =
                    "button";

                removeButton.setAttribute(
                    "aria-label",
                    `Remove ${file.name}`
                );

                removeButton.textContent =
                    "×";

                removeButton.style.color =
                    "var(--color-text-muted)";

                removeButton.addEventListener(
                    "click",
                    function () {

                        removeAttachment(
                            index
                        );

                    }
                );

                li.appendChild(
                    icon
                );

                li.appendChild(
                    name
                );

                li.appendChild(
                    removeButton
                );

                DOM.fileList.appendChild(
                    li
                );

            }
        );

    }

    function removeAttachment(
        index
    ) {

        if (
            index < 0 ||
            index >= appState.selectedFiles.length
        ) {

            return;

        }

        appState.selectedFiles.splice(
            index,
            1
        );

        renderAttachmentPreview();

        if (
            !appState.selectedFiles.length
        ) {

            clearAllAttachments();

        }

    }

    function clearAllAttachments() {

        appState.selectedFiles =
            [];

        if (DOM.fileInput) {

            DOM.fileInput.value =
                "";

        }

        if (DOM.filePreview) {

            DOM.filePreview.hidden =
                true;

        }

        if (DOM.fileList) {

            DOM.fileList.innerHTML =
                "";

        }

    }

    /* =========================================================
       27. TOOLS
       ========================================================= */

    function handleToolCardClick(
        tool
    ) {

        if (!tool) {

            return;

        }

        const labels = {

            web:
                "Web tool ready — backend integration is planned.",

            calculator:
                "Calculator tool ready — backend integration is planned.",

            files:
                "Files tool ready — backend integration is planned.",

            code:
                "Code tool ready — backend integration is planned."

        };

        showToast(
            labels[tool] ||
            "Tool is ready",
            "info"
        );

        logActivity(
            `Checked ${tool} tool`,
            "idle"
        );

    }

    /* =========================================================
       28. THEME
       ========================================================= */

    function toggleTheme() {

        appState.theme =
            appState.theme === "dark"
                ? "light"
                : "dark";

        applyTheme();

        saveApplicationState();

    }

    function applyTheme() {

        if (DOM.app) {

            DOM.app.dataset.theme =
                appState.theme;
            document.documentElement.dataset.theme = appState.theme;

        }

        if (DOM.themeToggle) {

            DOM.themeToggle.setAttribute(

                "aria-label",

                appState.theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"

            );

        }

    }

    /* =========================================================
       29. COMPOSER HELPERS
       ========================================================= */

    function autoResizeInput() {

        if (!DOM.messageInput) {

            return;

        }

        DOM.messageInput.style.height =
            "auto";

        DOM.messageInput.style.height =
            `${Math.min(
                DOM.messageInput.scrollHeight,
                180
            )}px`;

    }

    function resetInputHeight() {

        if (DOM.messageInput) {

            DOM.messageInput.style.height =
                "";

        }

    }

    function updateCharacterCounter() {

        if (
            !DOM.characterCounter ||
            !DOM.messageInput
        ) {

            return;

        }

        const max =
            DOM.messageInput.getAttribute(
                "maxlength"
            ) ||
            "10000";

        DOM.characterCounter.textContent =
            `${DOM.messageInput.value.length} / ${max}`;

    }

    function setSendEnabled(
        isEnabled
    ) {

        if (DOM.sendButton) {

            DOM.sendButton.disabled =
                !isEnabled;

        }

    }

    /* =========================================================
       30. RESPONSIVE HELPERS
       ========================================================= */

    function isMobileWidth(
        breakpoint
    ) {

        return window.innerWidth <=
            breakpoint;

    }

    function updateResponsiveState() {

        if (
            !isMobileWidth(
                MOBILE_SIDEBAR_BREAKPOINT
            ) &&
            appState.sidebarOpen
        ) {

            setSidebar(false);

        }

        updateMobileOverlay();

    }

    /* =========================================================
       31. KEYBOARD SHORTCUTS
       ========================================================= */

    function handleGlobalKeydown(
        event
    ) {

        const activeElement =
            document.activeElement;

        const isTypingElsewhere =
            activeElement !==
                DOM.messageInput &&
            activeElement &&
            [
                "INPUT",
                "TEXTAREA",
                "SELECT"
            ].includes(
                activeElement.tagName
            );

        if (
            event.key === "/" &&
            !isTypingElsewhere &&
            activeElement !==
                DOM.messageInput
        ) {

            event.preventDefault();

            if (DOM.messageInput) {

                DOM.messageInput.focus();

            }

        }

        if (
            event.key === "Escape"
        ) {

            closeMobilePanels();

            setProfileMenu(false);

        }

        if (
            event.key.toLowerCase() === "n" &&
            (
                event.ctrlKey ||
                event.metaKey
            )
        ) {

            event.preventDefault();

            createNewConversation(
                true
            );

        }

    }

    function handleOutsideClick(
        event
    ) {

        if (
            appState.profileMenuOpen &&
            DOM.profileMenu &&
            !DOM.profileMenu.contains(
                event.target
            ) &&
            DOM.profileButton &&
            !DOM.profileButton.contains(
                event.target
            )
        ) {

            setProfileMenu(false);

        }

        if (
            !isMobileWidth(
                MOBILE_SIDEBAR_BREAKPOINT
            )
        ) {

            return;

        }

        const clickedSidebar =
            DOM.sidebar &&
            DOM.sidebar.contains(
                event.target
            );

        const clickedMenuButton =
            DOM.mobileMenuButton &&
            DOM.mobileMenuButton.contains(
                event.target
            );

        if (
            appState.sidebarOpen &&
            !clickedSidebar &&
            !clickedMenuButton
        ) {

            setSidebar(false);

        }

    }

    /* =========================================================
       32. TOASTS
       ========================================================= */

    function showToast(
        message,
        type = "info"
    ) {

        if (!DOM.toastContainer) {

            return;

        }

        const colors = {

            success:
                "var(--color-success)",

            error:
                "var(--color-error)",

            info:
                "var(--color-primary)"

        };

        const toast =
            document.createElement(
                "div"
            );

        toast.style.display =
            "flex";

        toast.style.alignItems =
            "center";

        toast.style.gap =
            "10px";

        toast.style.padding =
            "12px 16px";

        toast.style.borderRadius =
            "14px";

        toast.style.border =
            "1px solid var(--border-color-light)";

        toast.style.background =
            "var(--color-panel-strong)";

        toast.style.boxShadow =
            "var(--shadow-panel)";

        toast.style.color =
            "var(--color-text-primary)";

        toast.style.fontSize =
            "0.78rem";

        toast.style.opacity =
            "0";

        toast.style.transform =
            "translateY(8px)";

        toast.style.transition =
            "opacity 220ms ease, transform 220ms ease";

        const color =
            colors[type] ||
            colors.info;

        const indicator =
            document.createElement(
                "span"
            );

        indicator.style.width =
            "7px";

        indicator.style.height =
            "7px";

        indicator.style.borderRadius =
            "50%";

        indicator.style.background =
            color;

        indicator.style.boxShadow =
            `0 0 8px ${color}`;

        const text =
            document.createElement(
                "span"
            );

        text.textContent =
            message;

        toast.appendChild(
            indicator
        );

        toast.appendChild(
            text
        );

        DOM.toastContainer.appendChild(
            toast
        );

        requestAnimationFrame(
            function () {

                toast.style.opacity =
                    "1";

                toast.style.transform =
                    "translateY(0)";

            }
        );

        setTimeout(
            function () {

                toast.style.opacity =
                    "0";

                toast.style.transform =
                    "translateY(8px)";

                setTimeout(
                    function () {

                        toast.remove();

                    },
                    250
                );

            },
            3200
        );

        announce(
            message
        );

    }

    function announce(
        message
    ) {

        if (DOM.liveRegion) {

            DOM.liveRegion.textContent =
                message;

        }

    }

    /* =========================================================
       33. LOCAL STORAGE
       ========================================================= */

    function saveApplicationState() {

        const stateToSave = {

            currentSection:
                appState.currentSection,

            currentConversation:
                appState.currentConversation,

            conversations:
                appState.conversations,

            contextPanelOpen:
                appState.contextPanelOpen,

            theme:
                appState.theme

        };

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(
                    stateToSave
                )
            );

        } catch (error) {

            console.error(
                "AWNARA: failed to save state",
                error
            );

        }

    }

    function loadApplicationState() {

        let savedState;

        try {

            savedState =
                localStorage.getItem(
                    STORAGE_KEY
                );

        } catch (error) {

            console.error(
                "AWNARA: failed to read storage",
                error
            );

            return;

        }

        if (!savedState) {

            return;

        }

        try {

            const parsed =
                JSON.parse(
                    savedState
                );

            appState.currentSection =
                parsed.currentSection ||
                "chat";

            appState.currentConversation =
                parsed.currentConversation ||
                null;

            appState.conversations =
                Array.isArray(
                    parsed.conversations
                )
                    ? parsed.conversations.filter(item => item && typeof item.id === "string" &&
                        typeof item.title === "string" && Array.isArray(item.messages) &&
                        item.messages.every(message => message && typeof message.content === "string" &&
                            ["user", "assistant"].includes(message.role)))
                    : [];

            appState.contextPanelOpen =
                parsed.contextPanelOpen !==
                false;

            appState.theme =
                parsed.theme ||
                "dark";

        } catch (error) {

            console.error(
                "AWNARA: failed to parse saved state",
                error
            );

            try {

                localStorage.removeItem(
                    STORAGE_KEY
                );

            } catch (storageError) {

                console.error(
                    storageError
                );

            }

        }

    }

    /* =========================================================
       34. UTILITIES
       ========================================================= */

    function delay(
        milliseconds
    ) {

        return new Promise(
            function (resolve) {

                setTimeout(
                    resolve,
                    milliseconds
                );

            }
        );

    }

    function createUniqueId(
        prefix
    ) {

        appState.idCounter +=
            1;

        return [

            prefix,

            Date.now(),

            appState.idCounter

        ].join("-");

    }

    function formatTime(
        timestamp
    ) {

        const date =
            new Date(
                timestamp
            );

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return "";

        }

        return new Intl.DateTimeFormat(
            undefined,
            {
                hour: "numeric",
                minute: "2-digit"
            }
        ).format(
            date
        );

    }

    function formatRelativeTime(
        timestamp
    ) {

        const now =
            Date.now();

        const time =
            new Date(
                timestamp
            ).getTime();

        if (
            Number.isNaN(time)
        ) {

            return "Just now";

        }

        const difference =
            Math.max(
                0,
                now - time
            );

        const minute =
            60 * 1000;

        const hour =
            60 * minute;

        const day =
            24 * hour;

        if (
            difference < minute
        ) {

            return "Just now";

        }

        if (
            difference < hour
        ) {

            return `${Math.floor(
                difference / minute
            )}m ago`;

        }

        if (
            difference < day
        ) {

            return `${Math.floor(
                difference / hour
            )}h ago`;

        }

        return `${Math.floor(
            difference / day
        )}d ago`;

    }

    function escapeHTML(
        value
    ) {

        return String(
            value ?? ""
        )

            .replace(
                /&/g,
                "&amp;"
            )

            .replace(
                /</g,
                "&lt;"
            )

            .replace(
                />/g,
                "&gt;"
            )

            .replace(
                /"/g,
                "&quot;"
            )

            .replace(
                /'/g,
                "&#039;"
            );

    }

    function scrollMessagesToBottom() {

        if (!DOM.messageContainer) {

            return;

        }

        requestAnimationFrame(
            function () {

                DOM.messageContainer.scrollTo({

                    top:
                        DOM.messageContainer.scrollHeight,

                    behavior:
                        "smooth"

                });

            }
        );

    }

    function showElement(
        element
    ) {

        if (element) {

            element.hidden =
                false;

        }

    }

    function hideElement(
        element
    ) {

        if (element) {

            element.hidden =
                true;

        }

    }

    /* =========================================================
       35. PUBLIC DEBUG API
       ========================================================= */

    window.AWNARA = {

        state:
            appState,

        sendMessage:
            sendMessage,

        createNewConversation:
            createNewConversation,

        navigateToSection:
            navigateToSection,

        setCoreState:
            setCoreState,

        toggleVoiceMode:
            toggleVoiceMode,

        toggleTheme:
            toggleTheme,

        toggleFocusMode:
            toggleFocusMode,

        clearAllAttachments:
            clearAllAttachments,

        saveApplicationState:
            saveApplicationState,

        loadApplicationState:
            loadApplicationState,

        apiRequest:
            apiRequest

    };

})();