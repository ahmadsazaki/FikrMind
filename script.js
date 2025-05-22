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

    // API Configuration
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const API_KEY = 'AIzaSyCV6t6EX9ImuvhajrwQmonPpookCL2mFsM'; // Replace with your actual key if needed
    const MODEL_NAME = 'gemini-2.0-flash';

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

    // Event Listeners
    generateBtn.addEventListener('click', handleGenerateMindMap);
    
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

            const response = await fetch(`${API_URL}?key=${API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: markdownPrompt }] }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error ${response.status}: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const markdown = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
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
                initialExpandLevel: 1
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
                initialExpandLevel: 1
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
            
            // Create HTML content with embedded markdown
            const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Mindmap - ${currentTopic}</title>
    <style>
        body { margin: 0; padding: 0; }
        svg { width: 100%; height: 100vh; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.15.4"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-view@0.15.4"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            try {
                const { Transformer, Markmap } = window.markmap;
                const transformer = new Transformer();
                // Embedded markdown content
                const markdown = \`${escapedMarkdown}\`;
                const { root } = transformer.transform(markdown);
                
                const svg = document.querySelector('#markmap');
                // Default color scheme if none provided
                const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1'];
                let colorIndex = 0;
                
                Markmap.create(svg, {
                    duration: 500,
                    nodeFont: '14px sans-serif',
                    color: (node) => {
                        // Handle cases where node or node.data is undefined
                        if (!node?.data) return colors[colorIndex % colors.length];
                        // Use provided color or fallback to our color scheme
                        return node.data.color || colors[colorIndex++ % colors.length];
                    },
                    paddingX: 15,
                    zoom: true,
                    pan: true,
                    maxWidth: 300,
                    colorFreezeLevel: 5,
                    initialExpandLevel: 2
                }, root);
            } catch (err) {
                console.error('Error initializing markmap:', err);
                document.body.innerHTML = '<p style="color:red;padding:20px;">Error loading mindmap. Please try again.</p>';
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
});
