document.addEventListener('DOMContentLoaded', () => {
    // Theme Management
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Set initial theme based on localStorage or OS preference
    const currentTheme = localStorage.getItem('theme') || 
                        (prefersDarkScheme.matches ? 'dark' : 'light');
    if (currentTheme === 'dark') {
        document.body.classList.add('dark');
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        themeToggleBtn.title = 'Toggle light mode';
    }

    // Set default purpose
    document.getElementById('purpose').value = 'personal';

    // Theme toggle handler
    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeToggleBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        themeToggleBtn.title = isDark ? 'Toggle light mode' : 'Toggle dark mode';
    });

    // API Configuration - OpenRouter with user settings
    const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    let OPENROUTER_API_KEY = '';
    let OPENROUTER_MODELS = [
        {
            name: 'meta-llama/llama-3.3-8b-instruct:free',
            timeout: 15000,
            priority: 1
        }
    ];
    let currentModelIndex = 0;

    // DOM Elements
    const topicInput = document.getElementById('topic-input');
    const generateBtn = document.getElementById('generate-btn');
    const inputContainer = document.getElementById('input-container');
    const mindmapContainer = document.getElementById('mindmap-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageElement = document.getElementById('error-message');
    
    // Verify all required elements exist
    if (!topicInput || !generateBtn || !mindmapContainer || !loadingIndicator || !errorMessageElement) {
        console.error('Critical DOM elements missing');
        return;
    }

    // Markmap instance and data
    let markmapInstance = null;
    let currentTopic = ''; // To store the main topic for context
    let currentMarkdown = ''; // To store the markdown content
    const { Transformer } = window.markmap;
    const transformer = new Transformer();

    // Settings Elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.getElementById('settings-close');
    const settingsCancel = document.getElementById('settings-cancel');
    const settingsSave = document.getElementById('settings-save');
    const apiKeyInput = document.getElementById('api-key-input');
    const modelSelect = document.getElementById('model-select');

    // Event Listeners
    generateBtn.addEventListener('click', handleGenerateMindMap);
    
    // Settings Event Listeners
    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsCancel.addEventListener('click', closeSettings);
    settingsSave.addEventListener('click', saveSettings);

    // Load settings on startup
    loadSettings();
    
    // Detail level image selection
    const detailLevelItems = document.querySelectorAll('.detail-level-item');
    let selectedDetailLevel = 'balanced'; // Default selection
    
    detailLevelItems.forEach(item => {
        const img = item.querySelector('.detail-level-img');
        item.addEventListener('click', () => {
            // Remove active class from all images
            document.querySelectorAll('.detail-level-img').forEach(i => i.classList.remove('active'));
            
            // Add active class to clicked image
            img.classList.add('active');
            selectedDetailLevel = img.dataset.level;
        });
    });

    async function handleGenerateMindMap() {
        currentTopic = topicInput.value.trim();
        const purpose = document.getElementById('purpose').value || 'personal';
        const detailLevel = selectedDetailLevel;
        const notes = document.getElementById('notes').value.trim();

        if (!currentTopic) {
            displayError('Please enter a topic.');
            return;
        }

        showLoading(true);
        clearError();
        clearPreviousResults();

        try {
            let markdownPrompt = `Create a mind map in Markdown format about: '${currentTopic}'.\n\n`;
            
            // Add detail level instructions
            if (detailLevel === 'basic') {
                markdownPrompt += `Detail Level: Basic (Overview)\nProvide a simple, high-level structure with few main branches and minimal sub-branches, focusing only on key points.\n\n`;
            } else if (detailLevel === 'balanced') {
                markdownPrompt += `Detail Level: Balanced (Recommended)\nProvide main branches with several relevant sub-branches, capturing essential relationships and details.\n\n`;
            } else if (detailLevel === 'in-depth') {
                markdownPrompt += `Detail Level: In-Depth (Comprehensive)\nProvide extensively multiple levels of sub-branches with rich information, examples, and connections.\n\n`;
            }
            
            if (purpose) {
                markdownPrompt += `Purpose: ${document.getElementById('purpose').options[document.getElementById('purpose').selectedIndex].text}\n\n`;
            }
            
            if (notes) {
                markdownPrompt += `Additional Notes:\n${notes}\n\n`;
            }

            markdownPrompt += `Use headings (#, ##, ###) for hierarchy and bullet points (-, *) for items.
Example structure:
# ${currentTopic}
## Main Aspect 1
- Detail 1
- Detail 2
## Main Aspect 2
- Detail 3

Make sure the mind map is comprehensive and well-organized.`;

            const markdown = await makeAPIRequest(markdownPrompt);
            renderMarkmap(markdown || '');

        } catch (error) {
            console.error('Error generating mind map:', error);
            displayError(`Failed to generate mind map: ${error.message}`);
            mindmapContainer.innerHTML = '<p class="placeholder">Error generating mind map.</p>';
        } finally {
            showLoading(false);
        }
    }

    function clearPreviousResults() {
        // Clear Markmap
        if (markmapInstance) {
            markmapInstance = null;
        }
        if (mindmapContainer) {
            mindmapContainer.innerHTML = '<svg id="markmap"></svg>';
            mindmapContainer.classList.add('hidden');
        }
        if (inputContainer) {
            inputContainer.classList.remove('hidden');
        }
    }

    function renderMarkmap(markdownContent) {
        if (!mindmapContainer) {
            console.error('Mindmap container not found');
            return;
        }

        const svgElement = mindmapContainer.querySelector('svg#markmap');

        if (!markdownContent) {
            displayError('No Markdown content to render for the mind map.');
            mindmapContainer.innerHTML = '<p class="placeholder">Mind map will appear here...</p>';
            return;
        }

        try {
            const { root, features } = transformer.transform(markdownContent);
            
            if (!root || (root.content === "" && (!root.children || root.children.length === 0))) {
                 console.warn("Transformed Markmap data is empty or invalid:", {root, features});
                 mindmapContainer.innerHTML = '<p class="placeholder">Could not generate a visual mind map from the provided data.</p>';
                 return;
            }

            // Hide input and show mindmap
            if (inputContainer) {
                inputContainer.classList.add('hidden');
            }
            mindmapContainer.classList.remove('hidden');

            const placeholderP = mindmapContainer.querySelector('p.placeholder');
            if(placeholderP) placeholderP.remove();

            const markmapOptions = {
                maxWidth: 300,
                duration: 500,
                nodeFont: '14px sans-serif',
                colorFreezeLevel: 5,
                initialExpandLevel: 4
            };
            
            if (markmapInstance) {
                markmapInstance.setData(root, markmapOptions);
            } else {
                markmapInstance = window.markmap.Markmap.create(svgElement, markmapOptions, root);
            }
            
        } catch (error) {
            console.error('Error rendering Markmap:', error);
            displayError(`Error rendering mind map: ${error.message}`);
            mindmapContainer.innerHTML = '<p class="placeholder">Error displaying mind map.</p>';
        }
    }

    function showLoading(isLoading) {
        if (isLoading) {
            loadingIndicator.classList.remove('hidden');
            generateBtn.disabled = true;
            generateBtn.innerHTML = 'Generating...';
        } else {
            loadingIndicator.classList.add('hidden');
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate';
        }
    }

    function displayError(message) {
        errorMessageElement.innerHTML = `<p>${message}</p>`;
        errorMessageElement.classList.remove('hidden');
    }

    function clearError() {
        errorMessageElement.classList.add('hidden');
        errorMessageElement.innerHTML = '';
    }

    function displayError(message) {
        errorMessageElement.innerHTML = `<p>${message}</p>`;
        errorMessageElement.classList.remove('hidden');
    }

    function clearError() {
        errorMessageElement.classList.add('hidden');
        errorMessageElement.innerHTML = '';
    }

    function clearPreviousResults() {
        // Clear Markmap
        if (markmapInstance) {
            markmapInstance = null;
        }
        mindmapContainer.innerHTML = '<svg id="markmap"></svg>';
        mindmapContainer.classList.add('hidden');
        inputContainer.classList.remove('hidden');
    }

    function sanitizeMarkdown(markdown) {
        // Remove markdown code block delimiters but preserve content
        return markdown.replace(/```[a-z]*\n([\s\S]*?)\n```/g, '$1');
    }

    function renderMarkmap(markdownContent) {
        const svgElement = mindmapContainer.querySelector('svg#markmap');

        if (!markdownContent) {
            displayError('No Markdown content to render for the mind map.');
            mindmapContainer.innerHTML = '<p class="placeholder">Mind map will appear here...</p>';
            return;
        }
        
        // Store the markdown content for saving
        currentMarkdown = markdownContent;

        try {
            // Sanitize markdown before processing
            markdownContent = sanitizeMarkdown(markdownContent);
            const { root, features } = transformer.transform(markdownContent);
            
            if (!root || (root.content === "" && (!root.children || root.children.length === 0))) {
                 console.warn("Transformed Markmap data is empty or invalid:", {root, features});
                 mindmapContainer.innerHTML = '<p class="placeholder">Could not generate a visual mind map from the provided data.</p>';
                 return;
            }

            // Hide input and show mindmap
            inputContainer.classList.add('hidden');
            mindmapContainer.classList.remove('hidden');

            const placeholderP = mindmapContainer.querySelector('p.placeholder');
            if(placeholderP) placeholderP.remove();

            const markmapOptions = {
                maxWidth: 300,
                duration: 500,
                nodeFont: '14px sans-serif',
                colorFreezeLevel: 5,
                initialExpandLevel: 4
            };
            
            if (markmapInstance) {
                markmapInstance.setData(root, markmapOptions);
            } else {
                markmapInstance = window.markmap.Markmap.create(svgElement, markmapOptions, root);
            }
            
        } catch (error) {
            console.error('Error rendering Markmap:', error);
            displayError(`Error rendering mind map: ${error.message}`);
            mindmapContainer.innerHTML = '<p class="placeholder">Error displaying mind map.</p>';
        }
    }

    function showLoading(isLoading) {
        if (isLoading) {
            loadingIndicator.classList.remove('hidden');
            generateBtn.disabled = true;
            generateBtn.innerHTML = 'Generating...';
        } else {
            loadingIndicator.classList.add('hidden');
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate';
        }
    }

    // Home button functionality
    document.getElementById('home-btn').addEventListener('click', () => {
        location.reload();
    });

    // Save button functionality
    document.getElementById('save-btn').addEventListener('click', async () => {
        if (!markmapInstance) {
            displayError('No mindmap to save. Please generate one first.');
            return;
        }

        try {
            // Verify and get the current markdown content
            if (!currentMarkdown || typeof currentMarkdown !== 'string') {
                throw new Error('Invalid markdown content');
            }

            // Escape markdown content for JavaScript string
            const escapedMarkdown = currentMarkdown
                .replace(/\\/g, '\\\\')
                .replace(/`/g, '\\`')
                .replace(/\$/g, '\\$');

            // Generate unique ID for this mindmap
            const mindmapId = 'mindmap-' + Date.now();
            
            // Get the current rendered SVG with all styles
            const svgElement = document.querySelector('#markmap');
            if (!svgElement) {
                throw new Error('Could not find mindmap SVG element');
            }

            // Clone the SVG to preserve original
            const svgClone = svgElement.cloneNode(true);
            
            // Add viewBox if missing
            if (!svgClone.hasAttribute('viewBox')) {
                const bbox = svgElement.getBBox();
                svgClone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
            }

            // Serialize the SVG with all its children and styles
            const serializer = new XMLSerializer();
            let svgContent = serializer.serializeToString(svgClone);

            // Ensure proper namespace
            if (!svgContent.includes('xmlns="http://www.w3.org/2000/svg"')) {
                svgContent = svgContent.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }

            // Create interactive HTML with markmap libraries
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Mindmap - ${currentTopic}</title>
    <style>
        body { 
            margin: 0; 
            padding: 0; 
            overflow: hidden;
            background-color: var(--background-color, white);
            color: var(--text-color, black);
        }
        svg { 
            width: 100%; 
            height: 100vh;
            font-family: sans-serif;
        }
        .markmap-node-text {
            font-size: 14px;
        }
        .markmap-node circle {
            fill: #3b82f6;
        }
        .error-message {
            color: red;
            padding: 20px;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.15.4"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-view@0.15.4"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            try {
                const { Transformer, Markmap } = window.markmap;
                const transformer = new Transformer();
                
                // Load the markdown content
                const markdown = \`${escapedMarkdown}\`;
                const { root } = transformer.transform(markdown);
                
                if (!root) {
                    throw new Error('Failed to transform markdown');
                }

                // Initialize interactive markmap
                const svg = document.querySelector('#markmap');
                const markmap = Markmap.create(svg, {
                    duration: 500,
                    nodeFont: '14px sans-serif',
                    color: (node) => node?.data?.color || '#3b82f6',
                    paddingX: 15,
                    zoom: true,
                    pan: true,
                    maxWidth: 300,
                    colorFreezeLevel: 5,
                    initialExpandLevel: 4
                }, root);

                // Fit to view initially
                markmap.fit();
                
            } catch (err) {
                console.error('Error initializing markmap:', err);
                document.body.innerHTML = '<div class="error-message">Error loading interactive mindmap. Please try again.</div>';
            }
        });
    </script>
</head>
<body>
    <svg id="markmap"></svg>
</body>
</html>`;

            // Create download link
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mindmap_${currentTopic.replace(/\s+/g, '_')}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error saving mindmap:', error);
            displayError('Failed to save mindmap. Please try again.');
        }
    });

    // Settings Functions
    function openSettings() {
        // Load current settings into the form
        const savedSettings = JSON.parse(localStorage.getItem('fikrMindSettings') || '{}');
        
        if (savedSettings.apiKey) {
            apiKeyInput.value = savedSettings.apiKey;
        } else {
            apiKeyInput.value = '';
        }
        
        if (savedSettings.selectedModels && Array.isArray(savedSettings.selectedModels)) {
            // Clear all selections first
            Array.from(modelSelect.options).forEach(option => {
                option.selected = false;
            });
            
            // Select the saved models
            savedSettings.selectedModels.forEach(modelName => {
                const option = Array.from(modelSelect.options).find(opt => opt.value === modelName);
                if (option) {
                    option.selected = true;
                }
            });
        } else {
            // Default selection - first free model
            if (modelSelect.options.length > 0) {
                modelSelect.options[0].selected = true;
            }
        }
        
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        settingsModal.classList.add('hidden');
    }

    function saveSettings() {
        const settings = {
            apiKey: apiKeyInput.value.trim(),
            selectedModels: Array.from(modelSelect.selectedOptions).map(option => option.value)
        };
        
        // Validate settings
        if (!settings.apiKey) {
            displayError('Please enter an API key');
            return;
        }
        
        if (settings.selectedModels.length === 0) {
            displayError('Please select at least one model');
            return;
        }
        
        // Save to localStorage
        localStorage.setItem('fikrMindSettings', JSON.stringify(settings));
        
        // Update the global API configuration
        updateAPIConfiguration(settings);
        
        closeSettings();
        displaySuccess('Settings saved successfully!');
    }

    function loadSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('fikrMindSettings') || '{}');
        
        if (savedSettings.apiKey || savedSettings.selectedModels) {
            updateAPIConfiguration(savedSettings);
        }
    }

    function updateAPIConfiguration(settings) {
        // Update API key
        if (settings.apiKey) {
            OPENROUTER_API_KEY = settings.apiKey;
        }
        
        // Update models list
        if (settings.selectedModels && settings.selectedModels.length > 0) {
            OPENROUTER_MODELS = settings.selectedModels.map((modelName, index) => ({
                name: modelName,
                timeout: index === 0 ? 30000 : 15000, // Primary model gets 30s, others 15s
                priority: index + 1
            }));
        }
        
        // Reset current model index
        currentModelIndex = 0;
    }

    // API Helper Functions with Sequential Fallback
    async function makeAPIRequest(prompt) {
        // Check if API key is configured
        if (!OPENROUTER_API_KEY) {
            throw new Error('Please configure your OpenRouter API key in Settings first');
        }
        
        return await makeOpenRouterRequestWithFallback(prompt);
    }

    async function makeOpenRouterRequestWithFallback(prompt) {
        // Check if API key is configured
        if (!OPENROUTER_API_KEY) {
            throw new Error('Please configure your OpenRouter API key in Settings first');
        }
        
        // Check if models are configured
        if (!OPENROUTER_MODELS || OPENROUTER_MODELS.length === 0) {
            throw new Error('Please select at least one model in Settings first');
        }
        
        // Try OpenRouter models in sequence
        for (let i = currentModelIndex; i < OPENROUTER_MODELS.length; i++) {
            const model = OPENROUTER_MODELS[i];
            console.log(`Trying model: ${model.name} (timeout: ${model.timeout}ms)`);
            
            try {
                const response = await Promise.race([
                    makeOpenRouterRequest(prompt, model.name),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(`Model timeout: ${model.name}`)), model.timeout)
                    )
                ]);
                
                // Success - update current model index for next request
                currentModelIndex = i;
                console.log(`Success with model: ${model.name}`);
                return response;
                
            } catch (error) {
                console.warn(`Model ${model.name} failed:`, error.message);
                
                // If this is the last OpenRouter model, throw error
                if (i === OPENROUTER_MODELS.length - 1) {
                    throw new Error(`All OpenRouter models failed. Last error: ${error.message}`);
                }
            }
        }
        
        throw new Error('No available OpenRouter models');
    }

    async function makeOpenRouterRequest(prompt, modelName) {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'FikrMind - Mind Map Generator'
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            let errorMessage = `OpenRouter API Error ${response.status}: ${errorData.error?.message || response.statusText}`;
            
            // Provide specific guidance for common errors
            if (response.status === 404 && errorData.error?.message?.includes('No endpoints found matching your data policy')) {
                errorMessage += '\n\nTo fix this:\n1. Go to https://openrouter.ai/settings/privacy\n2. Enable "Free model publication" in your privacy settings\n3. Save your settings and try again';
            } else if (response.status === 401) {
                errorMessage += '\n\nPlease check that your API key is correct and has not expired.';
            }
            
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim();
    }

    // Helper function for success messages
    function displaySuccess(message) {
        const successElement = document.createElement('div');
        successElement.className = 'success-message';
        successElement.textContent = message;
        document.body.appendChild(successElement);
        
        setTimeout(() => {
            document.body.removeChild(successElement);
        }, 3000);
    }
});
