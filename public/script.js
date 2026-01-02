// Konfigurasi API
const API_BASE_URL = window.location.origin; // Akan otomatis sesuai domain deploy
const API_ENDPOINTS = {
    generate: `${API_BASE_URL}/api/generate`,
    batch: `${API_BASE_URL}/api/generate/batch`,
    styles: `${API_BASE_URL}/api/styles`,
    createAccount: `${API_BASE_URL}/api/account/create`
};

// State aplikasi
let appState = {
    selectedStyle: 'realistic',
    selectedRatio: '1:1',
    currentImage: null,
    recentImages: JSON.parse(localStorage.getItem('recentImages') || '[]'),
    totalGenerations: parseInt(localStorage.getItem('totalGenerations') || '0'),
    isGenerating: false
};

// DOM Elements
const elements = {
    // Generator
    promptInput: document.getElementById('prompt'),
    charCounter: document.getElementById('charCounter'),
    styleGrid: document.getElementById('styleGrid'),
    ratioButtons: document.querySelectorAll('.ratio-btn'),
    generateBtn: document.getElementById('generateBtn'),
    generateBatchBtn: document.getElementById('generateBatchBtn'),
    
    // Preview
    previewPlaceholder: document.getElementById('previewPlaceholder'),
    previewResult: document.getElementById('previewResult'),
    generatedImage: document.getElementById('generatedImage'),
    generationProgress: document.getElementById('generationProgress'),
    progressTime: document.getElementById('progressTime'),
    
    // Buttons
    downloadBtn: document.getElementById('downloadBtn'),
    shareBtn: document.getElementById('shareBtn'),
    regenerateBtn: document.getElementById('regenerateBtn'),
    
    // Modals & UI
    loginModal: document.getElementById('loginModal'),
    toast: document.getElementById('toast'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    
    // Galleries
    recentGrid: document.getElementById('recentGrid'),
    stylesGrid: document.getElementById('stylesGrid'),
    galleryGrid: document.getElementById('galleryGrid'),
    
    // Footer stats
    totalGenerations: document.getElementById('totalGenerations'),
    totalUsers: document.getElementById('totalUsers')
};

// Inisialisasi aplikasi
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    // Update footer stats
    updateStats();
    
    // Load styles dari API
    await loadStyles();
    
    // Load gallery contoh
    loadGallery();
    
    // Load recent images
    loadRecentImages();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup navigation
    setupNavigation();
    
    // Setup suggestion buttons
    setupPromptSuggestions();
}

// Setup Event Listeners
function setupEventListeners() {
    // Prompt input dengan counter
    elements.promptInput.addEventListener('input', updateCharCounter);
    
    // Ratio buttons
    elements.ratioButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.ratioButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.selectedRatio = btn.dataset.ratio;
        });
    });
    
    // Generate buttons
    elements.generateBtn.addEventListener('click', generateImage);
    elements.generateBatchBtn.addEventListener('click', generateBatchImages);
    
    // Action buttons
    elements.downloadBtn.addEventListener('click', downloadImage);
    elements.shareBtn.addEventListener('click', shareImage);
    elements.regenerateBtn.addEventListener('click', regenerateImage);
    
    // Accordion
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const accordion = header.parentElement;
            accordion.classList.toggle('active');
        });
    });
    
    // Modal
    document.querySelectorAll('.btn-login, .close-modal').forEach(el => {
        el.addEventListener('click', toggleLoginModal);
    });
    
    // Filter gallery
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterGallery(btn.dataset.filter);
        });
    });
    
    // Toast auto-hide
    elements.toast.addEventListener('click', hideToast);
}

// Setup Navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section');
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinksContainer = document.querySelector('.nav-links');
    
    // Smooth scroll
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth' });
                
                // Update active link
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                // Close mobile menu
                if (window.innerWidth <= 768) {
                    navLinksContainer.style.display = 'none';
                }
            }
        });
    });
    
    // Mobile menu toggle
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            const isVisible = navLinksContainer.style.display === 'flex';
            navLinksContainer.style.display = isVisible ? 'none' : 'flex';
            
            if (!isVisible && window.innerWidth <= 768) {
                navLinksContainer.style.flexDirection = 'column';
                navLinksContainer.style.position = 'absolute';
                navLinksContainer.style.top = '70px';
                navLinksContainer.style.left = '0';
                navLinksContainer.style.right = '0';
                navLinksContainer.style.background = 'rgba(17, 24, 39, 0.98)';
                navLinksContainer.style.padding = '1rem';
                navLinksContainer.style.gap = '1rem';
                navLinksContainer.style.borderTop = '1px solid var(--border)';
            }
        });
    }
    
    // Update active link on scroll
    window.addEventListener('scroll', () => {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (scrollY >= (sectionTop - 100)) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// Setup Prompt Suggestions
function setupPromptSuggestions() {
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.promptInput.value = btn.dataset.prompt;
            updateCharCounter();
            showToast('Prompt applied! Feel free to modify it.');
        });
    });
}

// Update Character Counter
function updateCharCounter() {
    const length = elements.promptInput.value.length;
    elements.charCounter.textContent = `${length}/500`;
    elements.charCounter.style.color = length > 450 ? '#ef4444' : '#6b7280';
}

// Load Styles dari API
async function loadStyles() {
    try {
        showLoading();
        
        const response = await fetch(API_ENDPOINTS.styles);
        const data = await response.json();
        
        if (data.success) {
            // Render styles di generator
            renderStyleGrid(data.styles);
            
            // Render styles di styles section
            renderStylesSection(data.styles);
            
            // Select first style by default
            selectStyle('realistic');
        }
    } catch (error) {
        console.error('Error loading styles:', error);
        showToast('Failed to load styles. Using default styles.', 'error');
        
        // Fallback styles
        const fallbackStyles = [
            { id: 'realistic', name: 'Realistic', description: 'Gambar realistis seperti foto', icon: 'fas fa-camera' },
            { id: 'anime', name: 'Anime', description: 'Gaya anime Jepang', icon: 'fas fa-user-ninja' },
            { id: 'cartoon', name: 'Cartoon', description: 'Gaya kartun', icon: 'fas fa-smile' },
            { id: 'fantasy', name: 'Fantasy', description: 'Gaya fantasi ajaib', icon: 'fas fa-dragon' },
            { id: 'ghibli', name: 'Ghibli Studio', description: 'Gaya Studio Ghibli', icon: 'fas fa-film' },
            { id: 'cyberpunk', name: 'Cyberpunk', description: 'Gaya futuristik cyberpunk', icon: 'fas fa-city' }
        ];
        
        renderStyleGrid(fallbackStyles);
        renderStylesSection(fallbackStyles);
        selectStyle('realistic');
    } finally {
        hideLoading();
    }
}

// Render Style Grid
function renderStyleGrid(styles) {
    elements.styleGrid.innerHTML = styles.map(style => `
        <div class="style-card" data-style="${style.id}">
            <div class="style-icon">
                <i class="${style.icon || getStyleIcon(style.id)}"></i>
            </div>
            <h4>${style.name}</h4>
            <p>${style.description}</p>
        </div>
    `).join('');
    
    // Add click events
    document.querySelectorAll('.style-card').forEach(card => {
        card.addEventListener('click', () => {
            selectStyle(card.dataset.style);
        });
    });
}

// Render Styles Section
function renderStylesSection(styles) {
    elements.stylesGrid.innerHTML = styles.map(style => `
        <div class="style-large" data-style="${style.id}">
            <img src="${getStylePreviewImage(style.id)}" alt="${style.name}" class="style-image">
            <div class="style-content">
                <h3><i class="${style.icon || getStyleIcon(style.id)}"></i> ${style.name}</h3>
                <p>${style.description}</p>
                <button class="btn-secondary" style="margin-top: 1rem;" data-use-style="${style.id}">
                    <i class="fas fa-magic"></i> Use This Style
                </button>
            </div>
        </div>
    `).join('');
    
    // Add click events for use style buttons
    document.querySelectorAll('[data-use-style]').forEach(btn => {
        btn.addEventListener('click', () => {
            selectStyle(btn.dataset.useStyle);
            document.querySelector('#generate').scrollIntoView({ behavior: 'smooth' });
            showToast(`Selected ${btn.dataset.useStyle} style!`);
        });
    });
}

// Select Style
function selectStyle(styleId) {
    appState.selectedStyle = styleId;
    
    // Update UI
    document.querySelectorAll('.style-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.style === styleId) {
            card.classList.add('active');
        }
    });
    
    // Update preview
    updateStylePreview(styleId);
}

// Get Style Icon
function getStyleIcon(styleId) {
    const icons = {
        realistic: 'fas fa-camera',
        anime: 'fas fa-user-ninja',
        cartoon: 'fas fa-smile',
        fantasy: 'fas fa-dragon',
        ghibli: 'fas fa-film',
        cyberpunk: 'fas fa-city'
    };
    return icons[styleId] || 'fas fa-palette';
}

// Get Style Preview Image
function getStylePreviewImage(styleId) {
    const images = {
        realistic: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
        anime: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
        cartoon: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
        fantasy: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
        ghibli: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
        cyberpunk: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070'
    };
    return images[styleId] || 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070';
}

// Update Style Preview
function updateStylePreview(styleId) {
    // Anda bisa menambahkan efek visual untuk preview style
}

// Generate Single Image
async function generateImage() {
    const prompt = elements.promptInput.value.trim();
    
    if (!prompt) {
        showToast('Please enter a description for your image.', 'error');
        elements.promptInput.focus();
        return;
    }
    
    if (prompt.length < 5) {
        showToast('Please enter a more detailed description (at least 5 characters).', 'error');
        return;
    }
    
    if (appState.isGenerating) {
        showToast('Please wait for the current generation to complete.', 'warning');
        return;
    }
    
    try {
        appState.isGenerating = true;
        showLoading();
        
        // Show progress
        showGenerationProgress();
        
        // Prepare request data
        const requestData = {
            prompt: prompt,
            style: appState.selectedStyle,
            aspect_ratio: appState.selectedRatio
        };
        
        // Call API
        const response = await fetch(API_ENDPOINTS.generate, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update UI dengan hasil
            updatePreview(data.data);
            
            // Save to recent
            saveToRecent(data.data);
            
            // Update stats
            updateStats(true);
            
            showToast('Image generated successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to generate image');
        }
        
    } catch (error) {
        console.error('Generation error:', error);
        showToast(error.message || 'Failed to generate image. Please try again.', 'error');
    } finally {
        appState.isGenerating = false;
        hideLoading();
        hideGenerationProgress();
    }
}

// Generate Batch Images
async function generateBatchImages() {
    const prompt = elements.promptInput.value.trim();
    
    if (!prompt) {
        showToast('Please enter a description for your images.', 'error');
        return;
    }
    
    if (appState.isGenerating) {
        showToast('Please wait for the current generation to complete.', 'warning');
        return;
    }
    
    if (!confirm('Generate 4 variations of this prompt? This will use 4 credits.')) {
        return;
    }
    
    try {
        appState.isGenerating = true;
        showLoading();
        
        // Prepare prompts for batch
        const prompts = [
            prompt,
            `${prompt}, highly detailed`,
            `${prompt}, professional photography`,
            `${prompt}, digital art`
        ];
        
        // Prepare request data
        const requestData = {
            prompts: prompts,
            style: appState.selectedStyle,
            aspect_ratio: appState.selectedRatio
        };
        
        // Call API
        const response = await fetch(API_ENDPOINTS.batch, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Show first image
            if (data.data.images.length > 0) {
                updatePreview(data.data.images[0]);
            }
            
            // Save all to recent
            data.data.images.forEach(image => saveToRecent(image));
            
            // Update stats
            updateStats(true, data.data.images.length);
            
            showToast(`Generated ${data.data.images.length} images successfully!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to generate batch images');
        }
        
    } catch (error) {
        console.error('Batch generation error:', error);
        showToast(error.message || 'Failed to generate images. Please try again.', 'error');
    } finally {
        appState.isGenerating = false;
        hideLoading();
    }
}

// Show Generation Progress
function showGenerationProgress() {
    elements.previewPlaceholder.style.display = 'none';
    elements.previewResult.style.display = 'none';
    elements.generationProgress.style.display = 'block';
    
    // Animate progress bar
    const progressFill = document.querySelector('.progress-fill');
    progressFill.style.animation = 'none';
    setTimeout(() => {
        progressFill.style.animation = 'progress 45s linear forwards';
    }, 10);
}

// Hide Generation Progress
function hideGenerationProgress() {
    elements.generationProgress.style.display = 'none';
}

// Update Preview with Generated Image
function updatePreview(imageData) {
    appState.currentImage = imageData;
    
    elements.generatedImage.src = imageData.image_url;
    elements.generatedImage.alt = imageData.prompt;
    
    elements.previewPlaceholder.style.display = 'none';
    elements.previewResult.style.display = 'block';
    elements.generationProgress.style.display = 'none';
}

// Download Image
async function downloadImage() {
    if (!appState.currentImage) {
        showToast('No image to download', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(appState.currentImage.image_url);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `ai-art-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('Image downloaded successfully!', 'success');
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Failed to download image', 'error');
    } finally {
        hideLoading();
    }
}

// Share Image
async function shareImage() {
    if (!appState.currentImage) {
        showToast('No image to share', 'error');
        return;
    }
    
    try {
        if (navigator.share) {
            await navigator.share({
                title: 'AI Generated Art',
                text: `Check out this AI-generated image: "${appState.currentImage.prompt}"`,
                url: appState.currentImage.image_url,
            });
        } else {
            // Fallback: Copy to clipboard
            await navigator.clipboard.writeText(appState.currentImage.image_url);
            showToast('Image URL copied to clipboard!', 'success');
        }
    } catch (error) {
        console.error('Share error:', error);
        showToast('Failed to share image', 'error');
    }
}

// Regenerate Image
function regenerateImage() {
    if (appState.currentImage) {
        elements.promptInput.value = appState.currentImage.prompt;
        updateCharCounter();
        generateImage();
    }
}

// Save to Recent Images
function saveToRecent(imageData) {
    // Add to beginning of array
    appState.recentImages.unshift({
        ...imageData,
        timestamp: new Date().toISOString(),
        id: Date.now()
    });
    
    // Keep only last 20 images
    appState.recentImages = appState.recentImages.slice(0, 20);
    
    // Save to localStorage
    localStorage.setItem('recentImages', JSON.stringify(appState.recentImages));
    
    // Update UI
    loadRecentImages();
}

// Load Recent Images
function loadRecentImages() {
    elements.recentGrid.innerHTML = appState.recentImages.map(image => `
        <div class="recent-item" data-image="${image.id}">
            <img src="${image.image_url}" alt="${image.prompt}" loading="lazy">
        </div>
    `).join('');
    
    // Add click events
    document.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', () => {
            const imageId = parseInt(item.dataset.image);
            const image = appState.recentImages.find(img => img.id === imageId);
            if (image) {
                updatePreview(image);
                showToast('Loaded from history');
            }
        });
    });
}

// Load Gallery
function loadGallery() {
    // Contoh gallery images
    const galleryImages = [
        {
            id: 1,
            url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
            prompt: 'A majestic dragon flying over ancient mountains',
            style: 'fantasy',
            author: 'AI Artist'
        },
        {
            id: 2,
            url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
            prompt: 'Cyberpunk city at night with neon lights',
            style: 'cyberpunk',
            author: 'AI Artist'
        },
        {
            id: 3,
            url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
            prompt: 'Beautiful anime girl in cherry blossom garden',
            style: 'anime',
            author: 'AI Artist'
        },
        {
            id: 4,
            url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
            prompt: 'Cute cartoon animals having a picnic',
            style: 'cartoon',
            author: 'AI Artist'
        },
        {
            id: 5,
            url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
            prompt: 'Realistic portrait of an astronaut in space',
            style: 'realistic',
            author: 'AI Artist'
        },
        {
            id: 6,
            url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070',
            prompt: 'Ghibli style magical forest with spirits',
            style: 'ghibli',
            author: 'AI Artist'
        }
    ];
    
    elements.galleryGrid.innerHTML = galleryImages.map(image => `
        <div class="gallery-item" data-style="${image.style}">
            <img src="${image.url}" alt="${image.prompt}" loading="lazy">
            <div class="gallery-overlay">
                <p><strong>${image.prompt}</strong></p>
                <small>Style: ${image.style} | By: ${image.author}</small>
            </div>
        </div>
    `).join('');
}

// Filter Gallery
function filterGallery(filter) {
    const items = document.querySelectorAll('.gallery-item');
    
    items.forEach(item => {
        if (filter === 'all' || item.dataset.style === filter) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Update Stats
function updateStats(increment = false, amount = 1) {
    if (increment) {
        appState.totalGenerations += amount;
        localStorage.setItem('totalGenerations', appState.totalGenerations.toString());
    }
    
    elements.totalGenerations.textContent = appState.totalGenerations.toLocaleString();
    
    // Update total users (simulasi)
    const totalUsers = Math.floor(appState.totalGenerations / 10) + 100;
    elements.totalUsers.textContent = totalUsers.toLocaleString();
}

// Show Toast Notification
function showToast(message, type = 'info') {
    const toast = elements.toast;
    
    // Set message and type
    toast.textContent = message;
    toast.className = 'toast';
    
    // Add type class
    if (type === 'error') {
        toast.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    } else if (type === 'success') {
        toast.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    } else if (type === 'warning') {
        toast.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    }
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto hide after 5 seconds
    setTimeout(hideToast, 5000);
}

// Hide Toast
function hideToast() {
    elements.toast.classList.remove('show');
}

// Show Loading Overlay
function showLoading() {
    elements.loadingOverlay.style.display = 'flex';
}

// Hide Loading Overlay
function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

// Toggle Login Modal
function toggleLoginModal() {
    elements.loginModal.style.display = elements.loginModal.style.display === 'flex' ? 'none' : 'flex';
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === elements.loginModal) {
        toggleLoginModal();
    }
});
