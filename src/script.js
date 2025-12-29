let currentUser = null;
let users = [];
let emails = [];
let drafts = [];
let currentFilter = 'inbox';
let selectedEmails = new Set();
let composeAttachments = [];
let customFolders = [];

// Premium limits
const LIMITS = {
    free: {
        attachmentSize: 5 * 1024 * 1024, // 5MB
        dailyEmails: 50,
        customFolders: 0,
        themes: false,
        signature: false,
        autoReply: false,
        statistics: false,
        labels: 0,
        advancedSearch: false,
        exportEmails: false,
        scheduleEmails: false,
        readReceipts: false,
        priority: false,
        ads: true
    },
    premium: {
        attachmentSize: 20 * 1024 * 1024, // 20MB
        dailyEmails: -1, // illimité
        customFolders: 10,
        themes: true,
        signature: true,
        autoReply: true,
        statistics: true,
        labels: 20,
        advancedSearch: true,
        exportEmails: true,
        scheduleEmails: true,
        readReceipts: true,
        priority: true,
        ads: false
    }
};

function getUserLimits() {
    return currentUser?.isPremium ? LIMITS.premium : LIMITS.free;
}

// Labels personnalisés
let customLabels = [];
let bannerClosed = false;

function closePremiumBanner() {
    document.getElementById('premiumBanner').style.display = 'none';
    bannerClosed = true;
    localStorage.setItem('premiumBannerClosed', 'true');
}

function showPremiumBanner() {
    const banner = document.getElementById('premiumBanner');
    if (banner && !currentUser.isPremium && !bannerClosed) {
        const closed = localStorage.getItem('premiumBannerClosed');
        if (!closed) {
            banner.style.display = 'flex';
        }
    }
}

// Gestion des labels
async function addLabel(emailId, label) {
    if (!currentUser.isPremium) {
        showNotification('Les labels sont une fonctionnalité Premium', 'warning');
        showProfileSettings();
        return;
    }

    const email = emails.find(e => e.id === emailId);
    if (email) {
        if (!email.labels) email.labels = [];
        if (!email.labels.includes(label)) {
            email.labels.push(label);
            await saveEmails();
            renderEmailList();
            showNotification('Label ajouté', 'success');
        }
    }
}

// Exporter les emails (Premium)
function exportEmails() {
    if (!currentUser.isPremium) {
        showNotification('L\'export d\'emails est une fonctionnalité Premium', 'warning');
        showProfileSettings();
        return;
    }

    const userEmails = emails.filter(e =>
        e.to === currentUser.email || e.from === currentUser.email
    );

    const data = JSON.stringify(userEmails, null, 2);
    const blob = new Blob([data], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tartamada-mail-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Emails exportés avec succès', 'success');
}

// Marquer comme prioritaire (Premium)
async function togglePriority(emailId) {
    if (!currentUser.isPremium) {
        showNotification('Les emails prioritaires sont une fonctionnalité Premium', 'warning');
        showProfileSettings();
        return;
    }

    const email = emails.find(e => e.id === emailId);
    if (email) {
        email.priority = !email.priority;
        await saveEmails();
        renderEmailList();
        showNotification(email.priority ? 'Marqué comme prioritaire' : 'Priorité retirée', 'success');
    }
}

// Réponse automatique (Premium)
async function toggleAutoReply() {
    if (!currentUser.isPremium) {
        showNotification('La réponse automatique est une fonctionnalité Premium', 'warning');
        showProfileSettings();
        return;
    }

    if (!currentUser.autoReply) {
        const message = await showPrompt(
            'Entrez votre message de réponse automatique :',
            'Activer la réponse automatique',
            'Merci pour votre email. Je suis actuellement absent et vous répondrai dès que possible.'
        );

        if (message) {
            currentUser.autoReply = {
                enabled: true,
                message: message
            };
            const userIndex = users.findIndex(u => u.id === currentUser.id);
            if (userIndex !== -1) {
                users[userIndex] = currentUser;
                await saveUsers();
                showNotification('Réponse automatique activée', 'success');
                showAutoReplyIndicator();
            }
        }
    } else {
        currentUser.autoReply.enabled = !currentUser.autoReply.enabled;
        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex !== -1) {
            users[userIndex] = currentUser;
            await saveUsers();
            showNotification(
                currentUser.autoReply.enabled ? 'Réponse automatique activée' : 'Réponse automatique désactivée',
                'success'
            );
            showAutoReplyIndicator();
        }
    }
}

function showAutoReplyIndicator() {
    const contentHeader = document.querySelector('.content-header');
    if (!contentHeader) return;

    let indicator = document.getElementById('autoReplyIndicator');

    if (currentUser.isPremium && currentUser.autoReply?.enabled) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autoReplyIndicator';
            indicator.className = 'auto-reply-active';
            indicator.innerHTML = `
                        <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; stroke: var(--success);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <span><strong>Réponse automatique activée</strong> - Les nouveaux emails recevront une réponse automatique</span>
                        <button onclick="toggleAutoReply()" style="margin-left: auto; padding: 6px 12px; background: white; border: 1px solid var(--success); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--success);">
                            Désactiver
                        </button>
                    `;
            contentHeader.parentElement.insertBefore(indicator, contentHeader.nextSibling);
        }
    } else if (indicator) {
        indicator.remove();
    }
}

// File handling
function handleFileSelect(event) {
    const files = event.target.files;
    const limits = getUserLimits();

    for (let file of files) {
        if (file.size > limits.attachmentSize) {
            const maxSize = currentUser?.isPremium ? '20MB' : '5MB';
            showNotification(
                `Le fichier "${file.name}" est trop volumineux (max ${maxSize})${!currentUser?.isPremium ? ' - Passez à Premium pour 20MB !' : ''}`,
                'error'
            );
            continue;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            composeAttachments.push({
                name: file.name,
                size: file.size,
                type: file.type,
                data: e.target.result
            });
            updateComposeAttachments();
        };
        reader.readAsDataURL(file);
    }
}

function updateComposeAttachments() {
    const section = document.getElementById('composeAttachmentsSection');
    const list = document.getElementById('composeAttachmentList');
    const count = document.getElementById('attachmentCount');

    if (composeAttachments.length > 0) {
        section.classList.remove('hidden');
        count.textContent = composeAttachments.length;

        list.innerHTML = composeAttachments.map((file, index) => `
                    <div class="compose-attachment-item">
                        <svg viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>${file.name} (${formatFileSize(file.size)})</span>
                        <div class="compose-attachment-remove" onclick="removeAttachment(${index})">×</div>
                    </div>
                `).join('');
    } else {
        section.classList.add('hidden');
    }
}

function removeAttachment(index) {
    composeAttachments.splice(index, 1);
    updateComposeAttachments();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Profile Settings
function showProfileSettings() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const avatarSrc = currentUser.avatarData || '';
    const avatarDisplay = avatarSrc ?
        `<img src="${avatarSrc}" class="profile-avatar-large" alt="Avatar">` :
        `<div class="profile-avatar-large">${currentUser.username.charAt(0).toUpperCase()}</div>`;

    // Statistiques pour premium
    const statsSection = currentUser.isPremium ? `
                <div class="premium-features">
                    <h4>📊 Vos Statistiques</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 16px;">
                        <div style="background: rgba(102, 126, 234, 0.1); padding: 16px; border-radius: 12px;">
                            <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${emails.filter(e => e.from === currentUser.email).length}</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">Messages envoyés</div>
                        </div>
                        <div style="background: rgba(76, 175, 80, 0.1); padding: 16px; border-radius: 12px;">
                            <div style="font-size: 24px; font-weight: 700; color: var(--success);">${emails.filter(e => e.to === currentUser.email).length}</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">Messages reçus</div>
                        </div>
                        <div style="background: rgba(255, 193, 7, 0.1); padding: 16px; border-radius: 12px;">
                            <div style="font-size: 24px; font-weight: 700; color: #ffc107;">${emails.filter(e => (e.to === currentUser.email || e.from === currentUser.email) && e.starred).length}</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">Messages favoris</div>
                        </div>
                        <div style="background: rgba(156, 39, 176, 0.1); padding: 16px; border-radius: 12px;">
                            <div style="font-size: 24px; font-weight: 700; color: #9c27b0;">${drafts.length}</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">Brouillons</div>
                        </div>
                    </div>
                </div>
            ` : '';

    // Signature pour premium
    const signatureSection = currentUser.isPremium ? `
                <div class="form-group">
                    <label>✍️ Signature Email (Premium)</label>
                    <textarea id="userSignature" placeholder="Votre signature sera ajoutée automatiquement à vos emails..." style="min-height: 80px;">${currentUser.signature || ''}</textarea>
                </div>
            ` : `
                <div class="premium-features" style="background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);">
                    <h4>✍️ Signature Email</h4>
                    <p style="margin-top: 12px; color: var(--text-secondary); font-size: 14px;">
                        Ajoutez une signature personnalisée à tous vos emails. 
                        <strong>Fonctionnalité Premium uniquement.</strong>
                    </p>
                </div>
            `;

    // Thèmes pour premium
    const themeSection = currentUser.isPremium ? `
                <div class="form-group">
                    <label>🎨 Couleur de Thème Personnalisée (Premium)</label>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <div class="theme-option ${(!currentUser.customTheme || currentUser.customTheme === 'default') ? 'active' : ''}" 
                             onclick="selectTheme('default')" 
                             style="width: 60px; height: 60px; border-radius: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); cursor: pointer; border: 3px solid ${(!currentUser.customTheme || currentUser.customTheme === 'default') ? '#333' : 'transparent'};">
                        </div>
                        <div class="theme-option ${currentUser.customTheme === 'ocean' ? 'active' : ''}" 
                             onclick="selectTheme('ocean')" 
                             style="width: 60px; height: 60px; border-radius: 12px; background: linear-gradient(135deg, #0099ff 0%, #00ccff 100%); cursor: pointer; border: 3px solid ${currentUser.customTheme === 'ocean' ? '#333' : 'transparent'};">
                        </div>
                        <div class="theme-option ${currentUser.customTheme === 'forest' ? 'active' : ''}" 
                             onclick="selectTheme('forest')" 
                             style="width: 60px; height: 60px; border-radius: 12px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); cursor: pointer; border: 3px solid ${currentUser.customTheme === 'forest' ? '#333' : 'transparent'};">
                        </div>
                        <div class="theme-option ${currentUser.customTheme === 'sunset' ? 'active' : ''}" 
                             onclick="selectTheme('sunset')" 
                             style="width: 60px; height: 60px; border-radius: 12px; background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%); cursor: pointer; border: 3px solid ${currentUser.customTheme === 'sunset' ? '#333' : 'transparent'};">
                        </div>
                        <div class="theme-option ${currentUser.customTheme === 'royal' ? 'active' : ''}" 
                             onclick="selectTheme('royal')" 
                             style="width: 60px; height: 60px; border-radius: 12px; background: linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%); cursor: pointer; border: 3px solid ${currentUser.customTheme === 'royal' ? '#333' : 'transparent'};">
                        </div>
                        <div class="theme-option ${currentUser.customTheme === 'rose' ? 'active' : ''}" 
                             onclick="selectTheme('rose')" 
                             style="width: 60px; height: 60px; border-radius: 12px; background: linear-gradient(135deg, #f857a6 0%, #ff5858 100%); cursor: pointer; border: 3px solid ${currentUser.customTheme === 'rose' ? '#333' : 'transparent'};">
                        </div>
                    </div>
                </div>
            ` : `
                <div class="premium-features" style="background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);">
                    <h4>🎨 Thèmes Personnalisés</h4>
                    <p style="margin-top: 12px; color: var(--text-secondary); font-size: 14px;">
                        Choisissez parmi 6 thèmes de couleurs exclusifs. 
                        <strong>Fonctionnalité Premium uniquement.</strong>
                    </p>
                </div>
            `;

    const premiumSection = currentUser.isPremium ? `
                <div class="premium-features">
                    <h4>
                        <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; stroke: var(--premium);"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
                        Vos Avantages Premium Actifs
                    </h4>
                    <ul class="premium-feature-list" style="columns: 2; column-gap: 20px;">
                        <li>✅ Photo de profil personnalisée</li>
                        <li>✅ Badge Premium doré 👑</li>
                        <li>✅ Pièces jointes 20MB (vs 5MB)</li>
                        <li>✅ Envoi illimité d'emails</li>
                        <li>✅ Signature email personnalisée</li>
                        <li>✅ 6 thèmes de couleurs exclusifs</li>
                        <li>✅ Statistiques détaillées</li>
                        <li>✅ Labels colorés (20 max)</li>
                        <li>✅ Recherche avancée</li>
                        <li>✅ Export des emails</li>
                        <li>✅ Emails prioritaires</li>
                        <li>✅ Réponse automatique</li>
                        <li>✅ Accusés de réception</li>
                        <li>✅ Sans publicité</li>
                        <li>✅ Support prioritaire 24/7</li>
                        <li>✅ Stockage illimité</li>
                    </ul>
                    <div style="margin-top: 16px; display: flex; gap: 12px;">
                        <button class="btn btn-primary" style="width: auto;" onclick="closeProfileModal(); toggleAutoReply();">
                            ${currentUser.autoReply?.enabled ? '🔕 Désactiver' : '📧 Activer'} Réponse Auto
                        </button>
                        <button class="btn btn-cancel" style="width: auto;" onclick="closeProfileModal(); exportEmails();">
                            📥 Exporter mes emails
                        </button>
                    </div>
                </div>
            ` : `
                <div class="premium-features">
                    <h4>⭐ Débloquez TOUTES les fonctionnalités Premium !</h4>
                    <ul class="premium-feature-list" style="columns: 2; column-gap: 20px;">
                        <li>Photo de profil personnalisée</li>
                        <li>Badge Premium doré 👑</li>
                        <li>Pièces jointes 20MB (vs 5MB)</li>
                        <li>Envoi illimité (vs 50/jour)</li>
                        <li>Signature email personnalisée</li>
                        <li>6 thèmes de couleurs exclusifs</li>
                        <li>Statistiques détaillées</li>
                        <li>Labels colorés personnalisés</li>
                        <li>Recherche avancée avec filtres</li>
                        <li>Export des emails en JSON</li>
                        <li>Emails prioritaires</li>
                        <li>Réponse automatique d'absence</li>
                        <li>Accusés de réception</li>
                        <li>Sans publicité</li>
                        <li>Support prioritaire 24/7</li>
                        <li>Stockage illimité</li>
                    </ul>
                    <div style="margin-top: 20px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; color: white; text-align: center;">
                        <div style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">4,99€/mois</div>
                        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 16px;">Sans engagement • Annulation à tout moment</div>
                        <div style="font-size: 13px; opacity: 0.8;">💳 Paiement sécurisé • 🔒 Données protégées • 30 jours satisfait ou remboursé</div>
                    </div>
                    <p style="margin-top: 16px; color: var(--text-secondary); font-size: 14px; text-align: center;">
                        <strong>Contactez un administrateur</strong> pour activer votre compte Premium dès maintenant
                    </p>
                </div>
            `;

    overlay.innerHTML = `
                <div class="modal">
                    <div class="profile-modal">
                        <h3>
                            <svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            Paramètres du profil ${currentUser.isPremium ? '<span class="premium-badge" style="margin-left: 10px;">👑 Premium</span>' : ''}
                        </h3>
                        
                        <div class="profile-avatar-section">
                            ${avatarDisplay}
                            ${currentUser.isPremium ? `
                                <div>
                                    <div class="file-input-wrapper">
                                        <input type="file" id="avatarInput" accept="image/*" onchange="handleAvatarChange(event)">
                                        <label for="avatarInput" class="file-input-label">
                                            <svg viewBox="0 0 24 24" style="width: 18px; height: 18px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                            Changer la photo
                                        </label>
                                    </div>
                                    ${avatarSrc ? '<button class="btn btn-cancel" style="margin-top: 10px;" onclick="removeAvatar()">Supprimer la photo</button>' : ''}
                                </div>
                            ` : '<p style="color: var(--text-secondary); font-size: 14px;">🔒 Photo de profil disponible avec Premium</p>'}
                        </div>

                        ${premiumSection}
                        ${statsSection}
                        ${themeSection}
                        ${signatureSection}

                        <div class="form-group">
                            <label>Nom d'utilisateur</label>
                            <input type="text" value="${currentUser.username}" disabled style="background: var(--bg-main);">
                        </div>

                        <div class="form-group">
                            <label>Adresse email</label>
                            <input type="text" value="${currentUser.email}" disabled style="background: var(--bg-main);">
                        </div>

                        <div class="modal-actions" style="margin-top: 30px;">
                            ${currentUser.isPremium ? '<button class="btn btn-primary" onclick="saveProfileSettings()">Enregistrer les modifications</button>' : ''}
                            <button class="modal-btn-cancel" onclick="closeProfileModal()">Fermer</button>
                        </div>
                    </div>
                </div>
            `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
}

async function saveProfileSettings() {
    if (!currentUser.isPremium) return;

    const signature = document.getElementById('userSignature')?.value || '';
    currentUser.signature = signature;

    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        users[userIndex] = currentUser;
        await saveUsers();
        showNotification('Paramètres enregistrés !', 'success');
        closeProfileModal();
    }
}

function selectTheme(theme) {
    if (!currentUser.isPremium) {
        showNotification('Cette fonctionnalité est réservée aux membres Premium', 'warning');
        return;
    }

    currentUser.customTheme = theme;
    applyCustomTheme(theme);

    // Mettre à jour visuellement
    document.querySelectorAll('.theme-option').forEach(el => {
        el.style.border = '3px solid transparent';
    });
    event.target.style.border = '3px solid #333';
}

function applyCustomTheme(theme) {
    const themes = {
        default: {
            primary: '#667eea',
            secondary: '#764ba2'
        },
        ocean: {
            primary: '#0099ff',
            secondary: '#00ccff'
        },
        forest: {
            primary: '#11998e',
            secondary: '#38ef7d'
        },
        sunset: {
            primary: '#ff6b6b',
            secondary: '#ffa500'
        },
        royal: {
            primary: '#8e2de2',
            secondary: '#4a00e0'
        },
        rose: {
            primary: '#f857a6',
            secondary: '#ff5858'
        }
    };

    const colors = themes[theme] || themes.default;
    document.documentElement.style.setProperty('--primary', colors.primary);
    document.documentElement.style.setProperty('--secondary', colors.secondary);
}

function closeProfileModal() {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) document.body.removeChild(overlay);
}

async function handleAvatarChange(event) {
    if (!currentUser.isPremium) {
        showNotification('Cette fonctionnalité est réservée aux membres Premium', 'warning');
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showNotification('L\'image est trop volumineuse (max 2MB)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        currentUser.avatarData = e.target.result;
        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex !== -1) {
            users[userIndex] = currentUser;
            await saveUsers();
            updateNavAvatar();
            showNotification('Photo de profil mise à jour !', 'success');
            closeProfileModal();
            showProfileSettings();
        }
    };
    reader.readAsDataURL(file);
}

async function removeAvatar() {
    currentUser.avatarData = null;
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        users[userIndex] = currentUser;
        await saveUsers();
        updateNavAvatar();
        showNotification('Photo de profil supprimée', 'success');
        closeProfileModal();
        showProfileSettings();
    }
}

function updateNavAvatar() {
    const navAvatar = document.getElementById('navAvatar');
    const navUsername = document.getElementById('navUsername');

    if (currentUser.avatarData) {
        navAvatar.innerHTML = `<img src="${currentUser.avatarData}" style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;">`;
    } else {
        navAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
    }

    navUsername.innerHTML = currentUser.username + (currentUser.isPremium ? ' <span class="premium-badge">👑 Premium</span>' : '');

    // Afficher la section premium/free dans la sidebar
    const premiumSection = document.getElementById('premiumSection');
    const freeSection = document.getElementById('freeUserInfo');

    if (premiumSection && freeSection) {
        if (currentUser.isPremium) {
            premiumSection.style.display = 'block';
            freeSection.style.display = 'none';
            updatePremiumStats();
        } else {
            premiumSection.style.display = 'none';
            freeSection.style.display = 'block';
            updateFreeStats();
        }
    }
}

function updateFreeStats() {
    const today = new Date().toDateString();
    const sentToday = emails.filter(e =>
        e.from === currentUser.email &&
        new Date(e.timestamp).toDateString() === today
    ).length;

    const dailyLimitEl = document.getElementById('dailyLimit');
    if (dailyLimitEl) {
        dailyLimitEl.textContent = `${sentToday}/${LIMITS.free.dailyEmails}`;

        // Changer la couleur selon le pourcentage
        const percentage = (sentToday / LIMITS.free.dailyEmails) * 100;
        if (percentage >= 90) {
            dailyLimitEl.style.color = '#f44336';
        } else if (percentage >= 70) {
            dailyLimitEl.style.color = '#ff9800';
        } else {
            dailyLimitEl.style.color = '#4caf50';
        }
    }
}

function updatePremiumStats() {
    const today = new Date().toDateString();
    const sentToday = emails.filter(e =>
        e.from === currentUser.email &&
        new Date(e.timestamp).toDateString() === today
    ).length;
    const starred = emails.filter(e =>
        (e.to === currentUser.email || e.from === currentUser.email) &&
        e.starred && !e.deleted
    ).length;

    const sentTodayEl = document.getElementById('sentToday');
    const starredCountEl = document.getElementById('starredCount');
    const draftsCountEl = document.getElementById('draftsCount');

    if (sentTodayEl) sentTodayEl.textContent = sentToday;
    if (starredCountEl) starredCountEl.textContent = starred;
    if (draftsCountEl) draftsCountEl.textContent = drafts.length;
}

// Theme Management
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    const sunIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    const moonIcon = '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

    const icon = isDark ? sunIcon : moonIcon;
    if (document.getElementById('themeIcon')) document.getElementById('themeIcon').innerHTML = icon;
    if (document.getElementById('themeIcon2')) document.getElementById('themeIcon2').innerHTML = icon;
}

function loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        const sunIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        if (document.getElementById('themeIcon')) document.getElementById('themeIcon').innerHTML = sunIcon;
    }
}

// Email Selection
function toggleEmailSelection(emailId, event) {
    event.stopPropagation();
    if (selectedEmails.has(emailId)) {
        selectedEmails.delete(emailId);
    } else {
        selectedEmails.add(emailId);
    }
    updateToolbar();
    renderEmailList();
}

function toggleSelectAll() {
    const filteredEmails = getFilteredEmails();
    if (selectedEmails.size === filteredEmails.length) {
        selectedEmails.clear();
    } else {
        filteredEmails.forEach(email => selectedEmails.add(email.id));
    }
    updateToolbar();
    renderEmailList();
}

function updateToolbar() {
    const toolbar = document.getElementById('emailToolbar');
    const count = selectedEmails.size;

    if (count > 0) {
        toolbar.style.display = 'flex';
        document.getElementById('selectedCount').textContent = `${count} sélectionné(s)`;
    } else {
        toolbar.style.display = 'none';
    }
}

// Email Actions
function markAsRead() {
    selectedEmails.forEach(id => {
        const email = emails.find(e => e.id === id);
        if (email) email.read = true;
    });
    saveEmails();
    const count = selectedEmails.size;
    selectedEmails.clear();
    updateToolbar();
    renderEmailList();
    showNotification(`${count} message(s) marqué(s) comme lu(s)`, 'success');
}

function starSelected() {
    selectedEmails.forEach(id => {
        const email = emails.find(e => e.id === id);
        if (email) email.starred = !email.starred;
    });
    saveEmails();
    selectedEmails.clear();
    updateToolbar();
    renderEmailList();
    showNotification('Favoris mis à jour', 'success');
}

function moveToTrash() {
    selectedEmails.forEach(id => {
        const email = emails.find(e => e.id === id);
        if (email) email.deleted = true;
    });
    saveEmails();
    const count = selectedEmails.size;
    selectedEmails.clear();
    updateToolbar();
    renderEmailList();
    showNotification(`${count} message(s) déplacé(s) vers la corbeille`, 'success');
}

function toggleStar(emailId, event) {
    event.stopPropagation();
    const email = emails.find(e => e.id === emailId);
    if (email) {
        email.starred = !email.starred;
        saveEmails();
        renderEmailList();
    }
}

function deleteEmail(emailId, event) {
    event.stopPropagation();
    const email = emails.find(e => e.id === emailId);
    if (email) {
        email.deleted = true;
        saveEmails();
        renderEmailList();
        showNotification('Message déplacé vers la corbeille', 'success');
    }
}

async function saveDraft() {
    const to = document.getElementById('composeTo').value;
    const subject = document.getElementById('composeSubject').value;
    const body = document.getElementById('composeBody').value;

    if (!to && !subject && !body) {
        showNotification('Le brouillon est vide', 'warning');
        return;
    }

    const draft = {
        id: Date.now().toString(),
        to,
        subject,
        body,
        attachments: [...composeAttachments],
        timestamp: new Date().toISOString(),
        isDraft: true
    };

    drafts.push(draft);
    await storage.set('tartamada_drafts', JSON.stringify(drafts));

    showNotification('Brouillon sauvegardé', 'success');
    composeAttachments = [];
    cancelCompose();
}

function getFilteredEmails() {
    let filtered = [];

    switch (currentFilter) {
        case 'inbox':
            filtered = emails.filter(e => e.to === currentUser.email && !e.deleted);
            break;
        case 'unread':
            filtered = emails.filter(e => e.to === currentUser.email && !e.read && !e.deleted);
            break;
        case 'starred':
            filtered = emails.filter(e => (e.to === currentUser.email || e.from === currentUser.email) && e.starred && !e.deleted);
            break;
        case 'sent':
            filtered = emails.filter(e => e.from === currentUser.email && !e.deleted);
            break;
        case 'drafts':
            filtered = drafts;
            break;
        case 'trash':
            filtered = emails.filter(e => e.deleted && (e.to === currentUser.email || e.from === currentUser.email));
            break;
    }

    return filtered;
}

// Notification System
function showNotification(message, type = 'info', title = '') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icons = {
        success: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        warning: '<svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    const titles = {
        success: title || 'Succès',
        error: title || 'Erreur',
        info: title || 'Information',
        warning: title || 'Attention'
    };

    notification.innerHTML = `
                <div class="notification-icon">${icons[type]}</div>
                <div class="notification-content">
                    <div class="notification-title">${titles[type]}</div>
                    <div class="notification-message">${message}</div>
                </div>
                <button class="notification-close">
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            `;

    container.appendChild(notification);

    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => removeNotification(notification));

    setTimeout(() => removeNotification(notification), 5000);
}

function removeNotification(notification) {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 300);
}

// Confirmation Modal
function showConfirm(message, title = 'Confirmation') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
                    <div class="modal">
                        <div class="modal-header">
                            <div class="modal-icon">
                                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            </div>
                            <div class="modal-title">${title}</div>
                        </div>
                        <div class="modal-message">${message}</div>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn-cancel">Annuler</button>
                            <button class="modal-btn modal-btn-confirm">Confirmer</button>
                        </div>
                    </div>
                `;

        document.body.appendChild(overlay);

        overlay.querySelector('.modal-btn-cancel').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(false);
        });

        overlay.querySelector('.modal-btn-confirm').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(true);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(false);
            }
        });
    });
}

// Prompt Modal
function showPrompt(message, title = 'Saisie requise', defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
                    <div class="modal">
                        <div class="modal-header">
                            <div class="modal-icon" style="background: rgba(102, 126, 234, 0.1); color: var(--primary);">
                                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                            </div>
                            <div class="modal-title">${title}</div>
                        </div>
                        <div class="modal-message">${message}</div>
                        <input type="text" class="prompt-input" value="${defaultValue}" placeholder="Entrez votre réponse...">
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn-cancel">Annuler</button>
                            <button class="modal-btn modal-btn-confirm" style="background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);">Valider</button>
                        </div>
                    </div>
                `;

        document.body.appendChild(overlay);

        const input = overlay.querySelector('.prompt-input');
        input.focus();
        input.select();

        overlay.querySelector('.modal-btn-cancel').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(null);
        });

        overlay.querySelector('.modal-btn-confirm').addEventListener('click', () => {
            const value = input.value.trim();
            document.body.removeChild(overlay);
            resolve(value || null);
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const value = input.value.trim();
                document.body.removeChild(overlay);
                resolve(value || null);
            }
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(null);
            }
        });
    });
}

// Storage wrapper for local compatibility
const storage = {
    async get(key) {
        try {
            if (typeof window.storage !== 'undefined') {
                return await window.storage.get(key);
            } else {
                const value = localStorage.getItem(key);
                return value ? {
                    key,
                    value
                } : null;
            }
        } catch (error) {
            const value = localStorage.getItem(key);
            return value ? {
                key,
                value
            } : null;
        }
    },
    async set(key, value) {
        try {
            if (typeof window.storage !== 'undefined') {
                return await window.storage.set(key, value);
            } else {
                localStorage.setItem(key, value);
                return {
                    key,
                    value
                };
            }
        } catch (error) {
            localStorage.setItem(key, value);
            return {
                key,
                value
            };
        }
    }
};

// Initialize app
async function init() {
    loadTheme();
    await loadData();
}

// Load data from storage
async function loadData() {
    try {
        const usersData = await storage.get('tartamada_users');
        const emailsData = await storage.get('tartamada_emails');
        const draftsData = await storage.get('tartamada_drafts');

        users = usersData ? JSON.parse(usersData.value) : [];
        emails = emailsData ? JSON.parse(emailsData.value) : [];
        drafts = draftsData ? JSON.parse(draftsData.value) : [];

        if (!users.find(u => u.email === 'annaeg.qg@tartamada.com')) {
            users.push({
                id: 'admin-001',
                email: 'annaeg.qg@tartamada.com',
                username: 'Annaëg QG',
                password: 'cachou.21',
                isAdmin: true,
                isPremium: true,
                createdAt: new Date().toISOString(),
                avatarData: null,
                signature: 'Annaëg QG\nAdministrateur Tartamada Mail\n✨ Toujours à votre service',
                customTheme: 'default',
                autoReply: null
            });
            await saveUsers();
        } else {
            // Mettre à jour les utilisateurs existants avec les nouveaux champs
            users = users.map(u => ({
                ...u,
                signature: u.signature || '',
                customTheme: u.customTheme || 'default',
                autoReply: u.autoReply || null
            }));
            await saveUsers();
        }

        console.log('Données chargées:', users.length, 'utilisateurs');
    } catch (error) {
        console.error('Error loading data:', error);
        users = [{
            id: 'admin-001',
            email: 'annaeg.qg@tartamada.com',
            username: 'Annaëg QG',
            password: 'cachou.21',
            isAdmin: true,
            isPremium: true,
            createdAt: new Date().toISOString(),
            avatarData: null,
            signature: 'Annaëg QG\nAdministrateur Tartamada Mail\n✨ Toujours à votre service',
            customTheme: 'default'
        }];
        await saveUsers();
    }
}

async function saveUsers() {
    await storage.set('tartamada_users', JSON.stringify(users));
}

async function saveEmails() {
    await storage.set('tartamada_emails', JSON.stringify(emails));
}

// Auth functions
function showSignup() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('signupForm').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

document.getElementById('signupUsername')?.addEventListener('input', (e) => {
    const username = e.target.value.toLowerCase().replace(/\s+/g, '');
    document.getElementById('emailPreview').textContent = username + '@tartamada.com';
});

// Admin functions
function showAdmin() {
    console.log('Affichage de la page admin pour:', currentUser);

    try {
        // Cacher les autres pages
        const authPage = document.getElementById('authPage');
        const inboxPage = document.getElementById('inboxPage');
        const adminPage = document.getElementById('adminPage');

        if (authPage) authPage.classList.add('hidden');
        if (inboxPage) inboxPage.classList.add('hidden');
        if (adminPage) {
            adminPage.classList.remove('hidden');
            console.log('Page admin affichée');
        }

        // Mettre à jour le nom
        const adminNameEl = document.getElementById('adminName');
        if (adminNameEl) {
            adminNameEl.textContent = currentUser.username;
        }

        // Mettre à jour les stats et la liste
        setTimeout(() => {
            updateAdminStats();
            renderUserList();
        }, 100);

    } catch (error) {
        console.error('Erreur lors de l\'affichage de la page admin:', error);
        showNotification('Erreur lors du chargement de la page admin', 'error');
    }
}

function updateAdminStats() {
    try {
        const totalUsersEl = document.getElementById('totalUsers');
        const premiumUsersEl = document.getElementById('premiumUsers');
        const totalEmailsEl = document.getElementById('totalEmails');

        if (totalUsersEl) {
            totalUsersEl.textContent = users.length;
            console.log('Total utilisateurs:', users.length);
        }
        if (premiumUsersEl) {
            const premiumCount = users.filter(u => u.isPremium).length;
            premiumUsersEl.textContent = premiumCount;
            console.log('Utilisateurs premium:', premiumCount);
        }
        if (totalEmailsEl) {
            totalEmailsEl.textContent = emails.length;
            console.log('Total emails:', emails.length);
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour des stats:', error);
    }
}

function renderUserList() {
    console.log('Rendu de la liste des utilisateurs:', users.length, 'utilisateurs');
    const container = document.getElementById('userList');
    if (!container) {
        console.error('Container userList non trouvé!');
        return;
    }

    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Aucun utilisateur trouvé</p>';
        return;
    }

    users.forEach(user => {
        console.log('Affichage utilisateur:', user.username);
        const avatarClass = user.isAdmin ? 'admin' : user.isPremium ? 'premium' : 'regular';

        let avatarDisplay;
        if (user.avatarData) {
            avatarDisplay = `<img src="${user.avatarData}" class="user-avatar ${avatarClass}" style="width: 56px; height: 56px; border-radius: 14px; object-fit: cover;" alt="${user.username}">`;
        } else {
            avatarDisplay = `<div class="user-avatar ${avatarClass}">${user.username.charAt(0).toUpperCase()}</div>`;
        }

        const badges = [];
        if (user.isAdmin) badges.push('<span class="badge admin">Admin</span>');
        if (user.isPremium) badges.push('<span class="badge premium">Premium</span>');

        const actions = !user.isAdmin ? `
                    <div class="user-actions">
                        <button class="action-btn premium" onclick="togglePremium('${user.id}')">
                            ${user.isPremium ? '⭐ Retirer Premium' : '⭐ Activer Premium'}
                        </button>
                        <button class="action-btn reset" onclick="resetPassword('${user.id}')">
                            🔒 MDP
                        </button>
                        <button class="action-btn delete" onclick="deleteUser('${user.id}')">
                            🗑️ Supprimer
                        </button>
                    </div>
                ` : '<p style="color: var(--text-secondary); font-size: 13px;">Compte administrateur</p>';

        const userCard = document.createElement('div');
        userCard.className = 'user-card';
        userCard.innerHTML = `
                    <div class="user-info">
                        ${avatarDisplay}
                        <div class="user-details">
                            <h4>${user.username}</h4>
                            <p>${user.email}</p>
                            <div class="user-badges">${badges.join('')}</div>
                        </div>
                    </div>
                    ${actions}
                `;
        container.appendChild(userCard);
    });

    console.log('Liste des utilisateurs rendue avec succès');
}

async function togglePremium(userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
        user.isPremium = !user.isPremium;
        await saveUsers();
        updateAdminStats();
        renderUserList();
        showNotification(
            `Le statut Premium de ${user.username} a été ${user.isPremium ? 'activé' : 'désactivé'}`,
            'success'
        );
    }
}

async function resetPassword(userId) {
    const newPassword = await showPrompt('Entrez le nouveau mot de passe :', 'Réinitialisation du mot de passe');
    if (newPassword) {
        const user = users.find(u => u.id === userId);
        if (user) {
            user.password = newPassword;
            await saveUsers();
            showNotification(`Le mot de passe de ${user.username} a été modifié`, 'success');
        }
    }
}

async function deleteUser(userId) {
    const confirmed = await showConfirm(
        'Cette action est irréversible. Toutes les données de cet utilisateur seront supprimées.',
        'Supprimer ce compte ?'
    );

    if (confirmed) {
        const user = users.find(u => u.id === userId);
        const username = user ? user.username : 'Utilisateur';
        users = users.filter(u => u.id !== userId);
        await saveUsers();
        updateAdminStats();
        renderUserList();
        showNotification(`Le compte de ${username} a été supprimé`, 'success');
    }
}

async function handleSignup() {
    const username = document.getElementById('signupUsername').value;
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;

    if (password !== confirm) {
        showNotification('Les mots de passe ne correspondent pas', 'error');
        return;
    }

    if (username.length < 3) {
        showNotification('Le nom d\'utilisateur doit contenir au moins 3 caractères', 'error');
        return;
    }

    const email = username.toLowerCase().replace(/\s+/g, '') + '@tartamada.com';

    if (users.find(u => u.email === email)) {
        showNotification('Cet utilisateur existe déjà', 'error');
        return;
    }

    users.push({
        id: Date.now().toString(),
        email,
        username,
        password,
        isAdmin: false,
        isPremium: false,
        createdAt: new Date().toISOString(),
        avatarData: null,
        signature: '',
        customTheme: 'default',
        autoReply: null
    });

    await saveUsers();
    showNotification(`Votre adresse : ${email}`, 'success', 'Compte créé avec succès !');

    document.getElementById('signupUsername').value = '';
    document.getElementById('signupPassword').value = '';
    document.getElementById('signupConfirm').value = '';
    showLogin();
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    console.log('Tentative de connexion avec:', email);

    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        console.log('Utilisateur trouvé:', user.username, 'Admin:', user.isAdmin);
        currentUser = user;

        const authPage = document.getElementById('authPage');
        if (authPage) authPage.classList.add('hidden');

        showNotification(`Bienvenue ${user.username} !`, 'success', 'Connexion réussie');

        if (user.isAdmin) {
            console.log('Redirection vers page admin');
            showAdmin();
        } else {
            console.log('Redirection vers inbox');
            showInbox();
        }

        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';

        if (!user.isAdmin) {
            updateNavAvatar();
        }
    } else {
        console.log('Échec de connexion');
        showNotification('Vérifiez vos identifiants', 'error', 'Échec de connexion');
    }
}

function handleLogout() {
    const username = currentUser.username;
    currentUser = null;
    selectedEmails.clear();
    document.getElementById('adminPage').classList.add('hidden');
    document.getElementById('inboxPage').classList.add('hidden');
    document.getElementById('authPage').classList.remove('hidden');
    showLogin();
    showNotification(`À bientôt ${username} !`, 'info', 'Déconnexion');
}

// Admin functions
function updateAdminStats() {
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('premiumUsers').textContent = users.filter(u => u.isPremium).length;
    document.getElementById('totalEmails').textContent = emails.length;
}

function renderUserList() {
    console.log('Rendu de la liste des utilisateurs:', users.length, 'utilisateurs');
    const container = document.getElementById('userList');
    if (!container) {
        console.error('Container userList non trouvé!');
        return;
    }

    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Aucun utilisateur trouvé</p>';
        return;
    }

    users.forEach(user => {
        console.log('Affichage utilisateur:', user.username);
        const avatarClass = user.isAdmin ? 'admin' : user.isPremium ? 'premium' : 'regular';

        let avatarDisplay;
        if (user.avatarData) {
            avatarDisplay = `<img src="${user.avatarData}" class="user-avatar ${avatarClass}" style="width: 56px; height: 56px; border-radius: 14px; object-fit: cover;" alt="${user.username}">`;
        } else {
            avatarDisplay = `<div class="user-avatar ${avatarClass}">${user.username.charAt(0).toUpperCase()}</div>`;
        }

        const badges = [];
        if (user.isAdmin) badges.push('<span class="badge admin">Admin</span>');
        if (user.isPremium) badges.push('<span class="badge premium">Premium</span>');

        const actions = !user.isAdmin ? `
                    <div class="user-actions">
                        <button class="action-btn premium" onclick="togglePremium('${user.id}')">
                            ${user.isPremium ? '⭐ Retirer Premium' : '⭐ Activer Premium'}
                        </button>
                        <button class="action-btn reset" onclick="resetPassword('${user.id}')">
                            🔒 MDP
                        </button>
                        <button class="action-btn delete" onclick="deleteUser('${user.id}')">
                            🗑️ Supprimer
                        </button>
                    </div>
                ` : '<p style="color: var(--text-secondary); font-size: 13px;">Compte administrateur</p>';

        const userCard = document.createElement('div');
        userCard.className = 'user-card';
        userCard.innerHTML = `
                    <div class="user-info">
                        ${avatarDisplay}
                        <div class="user-details">
                            <h4>${user.username}</h4>
                            <p>${user.email}</p>
                            <div class="user-badges">${badges.join('')}</div>
                        </div>
                    </div>
                    ${actions}
                `;
        container.appendChild(userCard);
    });

    console.log('Liste des utilisateurs rendue avec succès');
}

async function togglePremium(userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
        user.isPremium = !user.isPremium;
        await saveUsers();
        updateAdminStats();
        renderUserList();
        showNotification(
            `Le statut Premium de ${user.username} a été ${user.isPremium ? 'activé' : 'désactivé'}`,
            'success'
        );
    }
}

async function resetPassword(userId) {
    const newPassword = await showPrompt('Entrez le nouveau mot de passe :', 'Réinitialisation du mot de passe');
    if (newPassword) {
        const user = users.find(u => u.id === userId);
        if (user) {
            user.password = newPassword;
            await saveUsers();
            showNotification(`Le mot de passe de ${user.username} a été modifié`, 'success');
        }
    }
}

async function deleteUser(userId) {
    const confirmed = await showConfirm(
        'Cette action est irréversible. Toutes les données de cet utilisateur seront supprimées.',
        'Supprimer ce compte ?'
    );

    if (confirmed) {
        const user = users.find(u => u.id === userId);
        const username = user ? user.username : 'Utilisateur';
        users = users.filter(u => u.id !== userId);
        await saveUsers();
        updateAdminStats();
        renderUserList();
        showNotification(`Le compte de ${username} a été supprimé`, 'success');
    }
}

// Inbox functions
function showInbox() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('adminPage').classList.add('hidden');
    document.getElementById('inboxPage').classList.remove('hidden');

    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('adminBtn').style.display = currentUser.isAdmin ? 'flex' : 'none';

    document.getElementById('emailListView').classList.remove('hidden');
    document.getElementById('emailView').classList.add('hidden');
    document.getElementById('composeView').classList.add('hidden');

    currentFilter = 'inbox';
    selectedEmails.clear();
    updateToolbar();
    updateNavAvatar();
    renderEmailList();

    // Appliquer le thème personnalisé si premium
    if (currentUser.isPremium && currentUser.customTheme) {
        applyCustomTheme(currentUser.customTheme);
    }

    // Afficher la bannière premium pour les non-premium
    setTimeout(() => {
        if (!currentUser.isPremium) {
            showPremiumBanner();
        }
    }, 2000);

    // Afficher l'indicateur de réponse automatique
    if (currentUser.isPremium) {
        setTimeout(() => showAutoReplyIndicator(), 500);
    }

    // Afficher les limites pour les non-premium
    if (!currentUser.isPremium) {
        const today = new Date().toDateString();
        const todayEmails = emails.filter(e =>
            e.from === currentUser.email &&
            new Date(e.timestamp).toDateString() === today
        ).length;
        const remaining = LIMITS.free.dailyEmails - todayEmails;

        if (remaining <= 10 && remaining > 0) {
            setTimeout(() => {
                showNotification(
                    `⚠️ Il vous reste ${remaining} emails à envoyer aujourd'hui. Passez à Premium pour un envoi illimité !`,
                    'warning',
                    'Limite d\'envoi'
                );
            }, 3000);
        }
    }
}

function filterEmails(type) {
    currentFilter = type;
    selectedEmails.clear();
    updateToolbar();

    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.sidebar-item').classList.add('active');

    const titles = {
        inbox: 'Boîte de réception',
        unread: 'Messages non lus',
        starred: 'Favoris',
        sent: 'Messages envoyés',
        drafts: 'Brouillons',
        trash: 'Corbeille'
    };
    document.getElementById('viewTitle').textContent = titles[type] || 'Boîte de réception';

    document.getElementById('emailListView').classList.remove('hidden');
    document.getElementById('emailView').classList.add('hidden');
    document.getElementById('composeView').classList.add('hidden');

    renderEmailList();
}

function renderEmailList() {
    const filteredEmails = getFilteredEmails();
    const container = document.getElementById('emailList');
    if (!container) return;

    const inboxCount = emails.filter(e => e.to === currentUser.email && !e.deleted).length;
    const unreadCount = emails.filter(e => e.to === currentUser.email && !e.read && !e.deleted).length;

    const inboxBadgeEl = document.getElementById('inboxBadge');
    const unreadBadgeEl = document.getElementById('unreadBadge');

    if (inboxBadgeEl) inboxBadgeEl.textContent = inboxCount;
    if (unreadBadgeEl) unreadBadgeEl.textContent = unreadCount;

    // Mettre à jour les stats premium
    if (currentUser?.isPremium) {
        updatePremiumStats();
    } else {
        updateFreeStats();
    }

    if (filteredEmails.length === 0) {
        const emptyMessages = {
            inbox: 'Aucun message dans votre boîte de réception',
            unread: 'Tous vos messages sont lus',
            starred: 'Aucun message en favoris',
            sent: 'Vous n\'avez envoyé aucun message',
            drafts: 'Aucun brouillon sauvegardé',
            trash: 'La corbeille est vide'
        };
        container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                        <h3>${emptyMessages[currentFilter]}</h3>
                        <p>Commencez à échanger avec vos contacts</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = '';
    filteredEmails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .forEach(email => {
            const displayEmail = currentFilter === 'sent' ? email.to : email.from;
            const sender = users.find(u => u.email === displayEmail);
            const isSelected = selectedEmails.has(email.id);
            const isStarred = email.starred;
            const isUnread = !email.read && email.to === currentUser.email;
            const hasAttachments = email.attachments && email.attachments.length > 0;
            const isPriority = email.priority && currentUser.isPremium;
            const labels = email.labels || [];

            const emailItem = document.createElement('div');
            emailItem.className = `email-item ${isUnread ? 'unread' : ''}`;
            emailItem.onclick = () => viewEmail(email.id);
            emailItem.style.position = 'relative';

            let avatarHTML;
            if (sender && sender.avatarData) {
                avatarHTML = `<img src="${sender.avatarData}" class="email-avatar" alt="${displayEmail}" style="width: 48px; height: 48px; border-radius: 12px; object-fit: cover;">`;
            } else {
                avatarHTML = `<div class="email-avatar">${displayEmail.charAt(0).toUpperCase()}</div>`;
            }

            const labelsHTML = labels.length > 0 ? labels.map(label =>
                `<span class="email-label" style="background: ${label.color}20; color: ${label.color}; border: 1px solid ${label.color};">
                            <span class="label-dot" style="background: ${label.color};"></span>
                            ${label.name}
                        </span>`
            ).join('') : '';

            emailItem.innerHTML = `
                        ${isPriority ? '<div class="priority-indicator"></div>' : ''}
                        <div class="email-checkbox ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation(); toggleEmailSelection('${email.id}', event)"></div>
                        ${avatarHTML}
                        <div class="email-content">
                            <div class="email-header">
                                <span class="email-from">
                                    ${isPriority ? '🔴 ' : ''}${displayEmail}
                                    ${hasAttachments ? '<span class="email-attachments-indicator"><svg viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' + email.attachments.length + '</span>' : ''}
                                    ${labelsHTML}
                                </span>
                                <span class="email-date">${new Date(email.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div class="email-subject">${email.subject || '(Pas d\'objet)'}</div>
                            <div class="email-preview">${email.body}</div>
                        </div>
                        <div class="email-actions">
                            ${currentUser.isPremium ? `<button class="email-action-btn" onclick="event.stopPropagation(); togglePriority('${email.id}')" title="Marquer comme prioritaire">
                                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            </button>` : ''}
                            <button class="email-action-btn ${isStarred ? 'starred' : ''}" onclick="event.stopPropagation(); toggleStar('${email.id}', event)">
                                <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            </button>
                            <button class="email-action-btn" onclick="event.stopPropagation(); deleteEmail('${email.id}', event)">
                                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    `;

            container.appendChild(emailItem);
        });
}

function searchEmails() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const items = document.querySelectorAll('.email-item');

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

function viewEmail(emailId) {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;

    if (email.to === currentUser.email && !email.read) {
        email.read = true;
        saveEmails();
    }

    document.getElementById('emailListView').classList.add('hidden');
    document.getElementById('emailView').classList.remove('hidden');

    const displayEmail = currentFilter === 'sent' ? email.to : email.from;
    const sender = users.find(u => u.email === displayEmail);

    const avatarDisplay = sender && sender.avatarData ?
        `<img src="${sender.avatarData}" class="sender-avatar" alt="${displayEmail}">` :
        `<div class="sender-avatar">${displayEmail.charAt(0).toUpperCase()}</div>`;

    const attachmentsHTML = email.attachments && email.attachments.length > 0 ? `
                <div class="email-attachments">
                    <h4>
                        <svg viewBox="0 0 24 24" style="width: 18px; height: 18px;"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        Pièces jointes (${email.attachments.length})
                    </h4>
                    <div class="attachment-list">
                        ${email.attachments.map(att => {
                            const isImage = att.type.startsWith('image/');
                            return `
                                <div class="attachment-item" onclick="downloadAttachment('${att.name}', '${att.data}')">
                                    ${isImage ? 
                                        `<img src="${att.data}" class="attachment-preview" alt="${att.name}">` :
                                        `<div class="attachment-icon">
                                            <svg viewBox="0 0 24 24" style="width: 20px; height: 20px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                        </div>`
                                    }
                                    <div class="attachment-info">
                                        <div class="attachment-name">${att.name}</div>
                                        <div class="attachment-size">${formatFileSize(att.size)}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : '';

    document.getElementById('emailView').innerHTML = `
                <button class="back-btn" onclick="filterEmails('${currentFilter}')">
                    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                    Retour
                </button>
                <div class="email-view-header">
                    <h3 class="email-view-title">${email.subject || '(Pas d\'objet)'}</h3>
                    <div class="email-view-meta">
                        <div class="email-sender">
                            ${avatarDisplay}
                            <div>
                                <div><strong>${currentFilter === 'sent' ? 'À' : 'De'}: </strong>${displayEmail}</div>
                                <div style="color: #999; font-size: 13px;">${new Date(email.timestamp).toLocaleString('fr-FR')}</div>
                            </div>
                        </div>
                        <div class="email-view-actions">
                            <button class="email-action-btn ${email.starred ? 'starred' : ''}" onclick="toggleStar('${email.id}', event); viewEmail('${email.id}')">
                                <svg viewBox="0 0 24 24" style="${email.starred ? 'fill: #ffc107;' : ''}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="email-view-body">${email.body}</div>
                ${attachmentsHTML}
            `;
}

function downloadAttachment(filename, dataUrl) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
}

function showCompose() {
    document.getElementById('emailListView').classList.add('hidden');
    document.getElementById('emailView').classList.add('hidden');
    document.getElementById('composeView').classList.remove('hidden');

    document.getElementById('composeTo').value = '';
    document.getElementById('composeSubject').value = '';
    document.getElementById('composeBody').value = '';
    composeAttachments = [];
    updateComposeAttachments();

    // Afficher les limites
    const limits = getUserLimits();
    const maxSize = currentUser?.isPremium ? '20MB' : '5MB';
    const composeView = document.getElementById('composeView');

    let limitInfo = composeView.querySelector('.limit-info');
    if (!limitInfo) {
        limitInfo = document.createElement('div');
        limitInfo.className = 'limit-info';
        limitInfo.style.cssText = 'background: rgba(102, 126, 234, 0.1); padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: var(--text-secondary);';
        composeView.insertBefore(limitInfo, composeView.querySelector('.form-group'));
    }

    if (currentUser?.isPremium) {
        limitInfo.innerHTML = `
                    <strong style="color: var(--premium);">👑 Compte Premium</strong><br>
                    • Pièces jointes : jusqu'à ${maxSize}<br>
                    • Envoi illimité d'emails<br>
                    • Signature automatique activée
                `;
    } else {
        const today = new Date().toDateString();
        const todayEmails = emails.filter(e =>
            e.from === currentUser.email &&
            new Date(e.timestamp).toDateString() === today
        ).length;
        const remaining = LIMITS.free.dailyEmails - todayEmails;

        limitInfo.innerHTML = `
                    <strong>📧 Compte Gratuit</strong><br>
                    • Pièces jointes : jusqu'à ${maxSize}<br>
                    • ${remaining}/${LIMITS.free.dailyEmails} emails restants aujourd'hui<br>
                    • <a href="#" onclick="showProfileSettings(); return false;" style="color: var(--primary); text-decoration: underline;">Passez à Premium pour plus !</a>
                `;
    }

    document.getElementById('composeTo').focus();
}

function cancelCompose() {
    composeAttachments = [];
    filterEmails(currentFilter);
}

async function handleSendEmail() {
    const to = document.getElementById('composeTo').value;
    const subject = document.getElementById('composeSubject').value;
    let body = document.getElementById('composeBody').value;

    if (!to || !subject || !body) {
        showNotification('Veuillez remplir tous les champs', 'warning');
        return;
    }

    if (!to.endsWith('@tartamada.com')) {
        showNotification('Vous ne pouvez envoyer des messages qu\'aux adresses @tartamada.com', 'error');
        return;
    }

    const recipient = users.find(u => u.email === to);
    if (!recipient) {
        showNotification('Destinataire introuvable', 'error');
        return;
    }

    // Vérifier la limite d'envoi pour les non-premium
    if (!currentUser.isPremium) {
        const today = new Date().toDateString();
        const todayEmails = emails.filter(e =>
            e.from === currentUser.email &&
            new Date(e.timestamp).toDateString() === today
        ).length;

        if (todayEmails >= LIMITS.free.dailyEmails) {
            showNotification(
                `Vous avez atteint votre limite de ${LIMITS.free.dailyEmails} emails par jour. Passez à Premium pour un envoi illimité !`,
                'warning',
                '📧 Limite atteinte'
            );
            return;
        }
    }

    // Ajouter la signature pour les premium
    if (currentUser.isPremium && currentUser.signature) {
        body += '\n\n---\n' + currentUser.signature;
    }

    emails.push({
        id: Date.now().toString(),
        from: currentUser.email,
        to,
        subject,
        body,
        attachments: [...composeAttachments],
        timestamp: new Date().toISOString(),
        read: false,
        starred: false,
        deleted: false,
        priority: false,
        labels: []
    });

    await saveEmails();

    // Envoyer une réponse automatique si le destinataire l'a activée
    if (recipient.isPremium && recipient.autoReply?.enabled) {
        setTimeout(async () => {
            emails.push({
                id: (Date.now() + 1).toString(),
                from: recipient.email,
                to: currentUser.email,
                subject: `Re: ${subject}`,
                body: recipient.autoReply.message,
                attachments: [],
                timestamp: new Date(Date.now() + 2000).toISOString(),
                read: false,
                starred: false,
                deleted: false,
                priority: false,
                labels: []
            });
            await saveEmails();
            showNotification(`${recipient.username} a envoyé une réponse automatique`, 'info');
        }, 3000);
    }

    const remaining = !currentUser.isPremium ? LIMITS.free.dailyEmails - emails.filter(e =>
        e.from === currentUser.email &&
        new Date(e.timestamp).toDateString() === new Date().toDateString()
    ).length : '∞';

    showNotification(
        `Message envoyé à ${recipient.username}${!currentUser.isPremium ? ` • ${remaining} emails restants aujourd'hui` : ''}`,
        'success',
        '✉️ Message envoyé !'
    );
    composeAttachments = [];
    filterEmails('inbox');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (currentUser && !document.getElementById('inboxPage').classList.contains('hidden')) {
            showCompose();
        }
    }
    if (e.key === 'Escape' && !document.getElementById('composeView').classList.contains('hidden')) {
        cancelCompose();
    }
});

init();
