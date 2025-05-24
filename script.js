// Global Variables
let markmapInstance = null;
let currentTopic = '';
let currentMarkdown = '';
let selectedDetailLevel = 'balanced'; // Default selection

// DOM Element Variables - to be assigned in DOMContentLoaded
let topicInput, generateBtn, inputContainer, mindmapContainer, loadingIndicator, errorMessageElement;
let historyListElement; // For renderHistoryList
let zoomControlsElement; // For zoom controls

// Markmap Transformer
let transformer;

// API Configuration (can be global or within DOMContentLoaded if only used there)
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const API_KEY = 'AIzaSyCV6t6EX9ImuvhajrwQmonPpookCL2mFsM'; // Replace with your actual key if needed
const MODEL_NAME = 'gemini-2.0-flash';


// --- Core Utility Functions (Moved to Global Scope) ---

function displayError(message) {
    if (errorMessageElement) {
        errorMessageElement.innerHTML = `<p>${message}</p>`;
        errorMessageElement.classList.remove('hidden');
    } else {
        console.error("displayError called before errorMessageElement is initialized. Message:", message);
    }
}

function clearError() {
    if (errorMessageElement) {
        errorMessageElement.classList.add('hidden');
        errorMessageElement.innerHTML = '';
    }
}

function showLoading(isLoading) {
    if (!loadingIndicator || !generateBtn) {
        console.warn("showLoading called before loadingIndicator or generateBtn is initialized.");
        return;
    }
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

function clearPreviousResults() {
    console.log('[clearPreviousResults] Called');
    if (markmapInstance) {
        if (markmapInstance.destroy) {
            console.log('[clearPreviousResults] Destroying existing markmap instance.');
            markmapInstance.destroy();
        }
        markmapInstance = null;
        console.log('[clearPreviousResults] markmapInstance set to null.');
    }
    if (mindmapContainer) {
        mindmapContainer.innerHTML = '<svg id="markmap"></svg>'; // Ensure fresh SVG
        mindmapContainer.classList.add('hidden');
        console.log('[clearPreviousResults] mindmapContainer reset and hidden.');
    }
    if (zoomControlsElement) {
        zoomControlsElement.classList.add('hidden');
        console.log('[clearPreviousResults] zoomControlsElement hidden.');
    }
    if (inputContainer) {
        inputContainer.classList.remove('hidden');
        console.log('[clearPreviousResults] inputContainer shown.');
    }
}

function sanitizeMarkdown(markdown) {
    // Remove markdown code block delimiters but preserve content
    return markdown.replace(/```[a-z]*\n([\s\S]*?)\n```/g, '$1');
}

function renderMarkmap(markdownContent) {
    console.log('[renderMarkmap] Started. Markdown length:', markdownContent?.length);
    if (zoomControlsElement) zoomControlsElement.classList.add('hidden');

    if (!mindmapContainer) {
        console.error("[renderMarkmap] CRITICAL: mindmapContainer is not initialized.");
        displayError("Internal error: Mindmap display area not ready.");
        return;
    }
    const svgElement = mindmapContainer.querySelector('svg#markmap');
    if (!svgElement) {
        console.error('[renderMarkmap] CRITICAL: svg#markmap element not found.');
        displayError('Internal error: Mindmap SVG area not found.');
        return;
    }

    if (!markdownContent || typeof markdownContent !== 'string' || markdownContent.trim() === '') {
        console.warn('[renderMarkmap] markdownContent is empty or invalid.');
        displayError('No Markdown content to render.');
        svgElement.innerHTML = ''; // Clear SVG
        return;
    }
    
    currentMarkdown = markdownContent; // Store for saving

    try {
        const sanitizedMd = sanitizeMarkdown(markdownContent);
        if (!transformer) {
            console.error("[renderMarkmap] CRITICAL: Transformer not initialized.");
            displayError("Internal error: Markmap transformer not ready.");
            return;
        }
        let root;
        try {
            const result = transformer.transform(sanitizedMd);
            if (!result || !result.root) {
                throw new Error('Transformer returned invalid result');
            }
            root = result.root;
            
            // Validate root structure
            if (typeof root !== 'object' || 
                (root.content === "" && (!root.children || root.children.length === 0))) {
                throw new Error('Invalid mindmap structure');
            }
            
            // Validate root has required properties
            if (!root.data || !root.data.id) {
                root.data = root.data || {};
                root.data.id = 'root-' + Date.now();
            }
        } catch (transformError) {
            console.error("[renderMarkmap] Error transforming markdown:", transformError);
            displayError('Failed to process mindmap data. Please try again.');
            svgElement.innerHTML = '';
            return;
        }

        // Destroy old instance BEFORE DOM manipulations for layout
        if (markmapInstance) {
            console.log('[renderMarkmap] Destroying existing markmapInstance.');
            markmapInstance.destroy();
            markmapInstance = null;
        }

        // Show container and prepare SVG
        if(inputContainer) inputContainer.classList.add('hidden');
        mindmapContainer.classList.remove('hidden');
        svgElement.innerHTML = ''; // Clear previous content
        console.log('[renderMarkmap] Mindmap container shown, SVG cleared.');

        // Force reflow and get actual dimensions of the container
        const containerWidth = Math.max(mindmapContainer.clientWidth, 800); // Minimum width
        const containerHeight = Math.max(mindmapContainer.clientHeight, 600); // Minimum height
        console.log(`[renderMarkmap] mindmapContainer dimensions: ${containerWidth}x${containerHeight}`);

        if (containerWidth === 0 || containerHeight === 0) {
            console.error("[renderMarkmap] mindmapContainer has zero dimensions. Aborting Markmap init.");
            displayError("Mindmap display area has no size. Cannot render.");
            if (zoomControlsElement) zoomControlsElement.classList.add('hidden');
            return;
        }

        // Explicitly set SVG dimensions and viewBox with minimum sizes
        svgElement.setAttribute('width', String(containerWidth));
        svgElement.setAttribute('height', String(containerHeight));
        svgElement.setAttribute('viewBox', `0 0 ${containerWidth} ${containerHeight}`);
        console.log(`[renderMarkmap] SVG attributes set: width, height, viewBox.`);

        // Ensure container is visible and has layout
        mindmapContainer.style.display = 'block';
        mindmapContainer.style.visibility = 'visible';
        mindmapContainer.style.touchAction = 'none'; // Allow custom touch handling
        svgElement.style.cursor = 'grab';

        const placeholderP = mindmapContainer.querySelector('p.placeholder');
        if(placeholderP) placeholderP.style.display = 'none';

        // Add event listeners for panning
        let isDragging = false;
        let startX, startY;
        
        svgElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            svgElement.style.cursor = 'grabbing';
            e.preventDefault();
        });

        svgElement.addEventListener('mousemove', (e) => {
            if (!isDragging || !markmapInstance) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (markmapInstance.state) {
                    if (markmapInstance && markmapInstance.state && markmapInstance.update) {
                        markmapInstance.state.x -= dx;
                        markmapInstance.state.y -= dy;
                        markmapInstance.update();
                    }
            }
            startX = e.clientX;
            startY = e.clientY;
            e.preventDefault();
        });

        svgElement.addEventListener('mouseup', () => {
            isDragging = false;
            svgElement.style.cursor = 'grab';
        });

        svgElement.addEventListener('mouseleave', () => {
            isDragging = false;
            svgElement.style.cursor = 'grab';
        });

        // Add touch event listeners for pinch-to-zoom
        let initialDistance = 0;
        svgElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                e.preventDefault();
            }
        });

        svgElement.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && markmapInstance) {
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const scale = currentDistance / initialDistance;
                markmapInstance.rescale(markmapInstance.state.k * scale);
                initialDistance = currentDistance;
                e.preventDefault();
            } else if (e.touches.length === 1 && isDragging && markmapInstance.state) {
                const touch = e.touches[0];
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                if (markmapInstance && markmapInstance.state && markmapInstance.update) {
                    markmapInstance.state.x -= dx;
                    markmapInstance.state.y -= dy;
                    markmapInstance.update();
                }
                startX = touch.clientX;
                startY = touch.clientY;
                e.preventDefault();
            }
        });

        svgElement.addEventListener('touchend', () => {
            isDragging = false;
        });

        const currentMarkmapOptions = {
            maxWidth: 300,
            duration: 500,
            nodeFont: '14px sans-serif',
            colorFreezeLevel: 2,
            initialExpandLevel: 2,
            zoom: true,  // Enable built-in zoom
            pan: true,   // Enable built-in panning
            // Let Markmap.create handle the initial fit by NOT specifying fit:false
        };
        console.log('[renderMarkmap] Markmap options prepared (allowing default fit):', currentMarkmapOptions);

        // Double check markmap library is loaded
        if (!window.markmap || !window.markmap.Markmap) {
            console.error('[renderMarkmap] Markmap library not loaded');
            displayError('Mindmap library failed to load. Please refresh the page.');
            return;
        }

        requestAnimationFrame(() => { // Defer Markmap.create to ensure DOM is ready
            try {
                console.log('[renderMarkmap-rAF] Calling Markmap.create().');
                
                // Add fallback values to root if missing
                root.data = root.data || {};
                root.data.id = root.data.id || 'root-' + Date.now();
                
                markmapInstance = window.markmap.Markmap.create(svgElement, {
                    ...currentMarkmapOptions,
                    fit: true, // Force initial fit
                    initialExpandLevel: 2,
                    color: (node) => node?.data?.color || '#3b82f6',
                    pan: true // Ensure panning is enabled
                }, root);
                
                if (markmapInstance && markmapInstance.state) {
                    console.log('[renderMarkmap-rAF] Markmap.create() successful. State after creation:', markmapInstance.state);
                    
                    // Validate and fix state if needed
                    if (typeof markmapInstance.state.k !== 'number' || !isFinite(markmapInstance.state.k)) {
                        markmapInstance.state.k = 1;
                    }
                    if (typeof markmapInstance.state.x !== 'number' || !isFinite(markmapInstance.state.x)) {
                        markmapInstance.state.x = 0;
                    }
                    if (typeof markmapInstance.state.y !== 'number' || !isFinite(markmapInstance.state.y)) {
                        markmapInstance.state.y = 0;
                    }
                    
                    // Force initial fit if state was invalid
                    if (markmapInstance.fit) {
                        markmapInstance.fit();
                    }

                    if (zoomControlsElement) {
                        zoomControlsElement.classList.remove('hidden');
                        console.log('[renderMarkmap-rAF] Zoom controls shown.');
                    }
                } else {
                    console.error('[renderMarkmap-rAF] Markmap.create() did not return a valid instance or state.');
                    displayError("Failed to create mindmap instance. Please try again.");
                    if (zoomControlsElement) zoomControlsElement.classList.add('hidden');
                }
            } catch (creationError) {
                console.error('[renderMarkmap-rAF] Error during Markmap.create():', creationError);
                displayError(`Error creating mind map: ${creationError.message}`);
                if (zoomControlsElement) zoomControlsElement.classList.add('hidden');
                
                // Attempt recovery by forcing a re-render
                setTimeout(() => {
                    if (markmapInstance && markmapInstance.fit) {
                        markmapInstance.fit();
                    }
                }, 100);
            }
        });
        
    } catch (error) { // Catch for synchronous errors (e.g., transformer error)
        console.error('[renderMarkmap] Sync error:', error);
        displayError(`Error rendering mind map: ${error.message}`);
        if (svgElement) svgElement.innerHTML = '';
        if (zoomControlsElement) zoomControlsElement.classList.add('hidden');
    }
}

async function handleGenerateMindMap() {
    console.log('handleGenerateMindMap triggered');
    if (!topicInput || !document.getElementById('purpose') || !document.getElementById('notes')) {
        displayError("Input fields not ready.");
        return;
    }
    currentTopic = topicInput.value.trim();
    const purposeValue = document.getElementById('purpose').value || 'personal';
    const detailLevel = selectedDetailLevel; // Uses global selectedDetailLevel
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
        
        if (detailLevel === 'basic') {
            markdownPrompt += `Detail Level: Basic (Overview)\nProvide a simple, high-level structure with few main branches and minimal sub-branches, focusing only on key points.\n\n`;
        } else if (detailLevel === 'balanced') {
            markdownPrompt += `Detail Level: Balanced (Recommended)\nProvide main branches with several relevant sub-branches, capturing essential relationships and details.\n\n`;
        } else if (detailLevel === 'in-depth') {
            markdownPrompt += `Detail Level: In-Depth (Comprehensive)\nProvide extensively multiple levels of sub-branches with rich information, examples, and connections.\n\n`;
        }
        
        if (purposeValue) {
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: markdownPrompt }] }] })
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
        if (mindmapContainer) mindmapContainer.innerHTML = '<p class="placeholder">Error generating mind map.</p>';
        if (zoomControlsElement) zoomControlsElement.classList.add('hidden'); // Ensure hidden on error
    } finally {
        showLoading(false);
    }
}


// --- History Management Functions (Can stay here as they use global utilities) ---
function saveToHistory(mindmapState) {
    const history = JSON.parse(localStorage.getItem('mindmapHistory') || '{"history":[]}');
    const newItem = {
        id: Date.now().toString(),
        title: mindmapState.title,
        timestamp: Date.now(),
        markdown: mindmapState.markdown,
        svg: mindmapState.svg, // This is the outerHTML of svg#markmap
        topic: mindmapState.topic
    };
    history.history.unshift(newItem); // Add to the beginning
    localStorage.setItem('mindmapHistory', JSON.stringify(history));
    renderHistoryList();
}

function renderHistoryList() {
    if (!historyListElement) {
        console.warn("renderHistoryList called before historyListElement is initialized.");
        return;
    }
    const history = JSON.parse(localStorage.getItem('mindmapHistory')) || { history: [] };
    
    historyListElement.innerHTML = ''; // Clear current list
    history.history.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.dataset.id = item.id;
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'history-title';
        titleSpan.textContent = item.title;
        // titleSpan.contentEditable = true; // Made editable only on pencil click

        const editBtn = document.createElement('span');
        editBtn.className = 'history-edit';
        editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'history-delete';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        
        historyItem.appendChild(titleSpan);
        historyItem.appendChild(editBtn);
        historyItem.appendChild(deleteBtn);
        historyListElement.appendChild(historyItem);
        
        // Event Listeners for history item actions
        titleSpan.addEventListener('blur', () => {
            updateHistoryItem(item.id, titleSpan.textContent);
            titleSpan.contentEditable = false;
        });
        titleSpan.contentEditable = false; // Default to not editable

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistoryItem(item.id);
        });
        
        historyItem.addEventListener('click', function(e) {
            if (e.target === this || e.target.classList.contains('history-title')) {
                e.preventDefault();
                e.stopPropagation();
                
                try {
                    console.log('Loading history item:', item.id);
                    if(topicInput) topicInput.value = item.title;
                    currentMarkdown = item.markdown || '';
                    currentTopic = item.topic || item.title;
                    
                    clearPreviousResults(); 
                    
                    if(inputContainer) inputContainer.classList.add('hidden');
                    if(mindmapContainer) mindmapContainer.classList.remove('hidden');

                    if (item.markdown && typeof item.markdown === 'string' && item.markdown.trim() !== '') {
                        renderMarkmap(item.markdown);
                    } else {
                        console.error('History item is missing or has invalid markdown content:', item.id, "Markdown:", item.markdown);
                        displayError('Cannot load mindmap: Markdown data missing or invalid in history item.');
                        if(inputContainer) inputContainer.classList.remove('hidden');
                        if(mindmapContainer) mindmapContainer.classList.add('hidden');
                    }
                    
                    const header = document.querySelector('.mindmap-header');
                    if (header) header.classList.remove('expanded');
                    const container = document.querySelector('.container');
                    if (container) container.style.marginLeft = '80px';
                    
                    console.log('Mindmap loaded successfully from history');
                } catch (err) {
                    console.error('Error loading history item:', err);
                    displayError('Failed to load mindmap from history. ' + err.message);
                    if(inputContainer) inputContainer.classList.remove('hidden');
                    if(mindmapContainer) mindmapContainer.classList.add('hidden');
                }
            }
        });

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const titleSpanToEdit = historyItem.querySelector('.history-title');
            titleSpanToEdit.contentEditable = true;
            titleSpanToEdit.focus();
            const range = document.createRange();
            range.selectNodeContents(titleSpanToEdit);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        });
    });
}

function updateHistoryItem(id, newTitle) {
    const history = JSON.parse(localStorage.getItem('mindmapHistory')) || { history: [] };
    const itemIndex = history.history.findIndex(item => item.id === id);
    if (itemIndex > -1) {
        history.history[itemIndex].title = newTitle;
        localStorage.setItem('mindmapHistory', JSON.stringify(history));
    }
}

function deleteHistoryItem(id) {
    let history = JSON.parse(localStorage.getItem('mindmapHistory')) || { history: [] };
    history.history = history.history.filter(item => item.id !== id);
    localStorage.setItem('mindmapHistory', JSON.stringify(history));
    renderHistoryList();
}


// Save Popup Functionality
function setupSavePopup() {
    const saveBtn = document.getElementById('save-btn');
    const savePopup = document.querySelector('.save-popup');
    const saveOptions = document.querySelectorAll('.save-option');

    saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        savePopup.classList.toggle('show');
    });

    saveOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const format = option.dataset.format;
            if (format) {
                handleSave(format);
            }
            savePopup.classList.remove('show');
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.save-toggle-container')) {
            savePopup.classList.remove('show');
        }
    });
}

function handleSave(format) {
    const topic = topicInput.value.trim() || 'Untitled Mindmap';
    
    switch(format) {
        case 'html':
            saveInteractiveHTML(topic);
            break;
        case 'svg':
            saveAsSVG(topic);
            break;
        case 'pdf':
            downloadMindmap('pdf');
            break;
        case 'jpg':
        case 'png':
            downloadImage(format, topic);
            break;
    }
}

function downloadImage(format, topic) {
    const saveBtn = document.getElementById('save-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
    saveBtn.disabled = true;

    // Use html2canvas to capture the mindmap
    html2canvas(document.querySelector('#mindmap-container'), {
        scale: 2, // Double resolution for better quality
        backgroundColor: '#ffffff', // White background
        logging: false,
        useCORS: true,
        allowTaint: true
    }).then(canvas => {
        // Create download link
        const link = document.createElement('a');
        link.download = `mindmap_${topic.replace(/\s+/g, '_')}_${new Date().getTime()}.${format}`;
        link.href = canvas.toDataURL(`image/${format}`, 0.92); // 0.92 quality for JPG
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }).catch(err => {
        console.error('Error exporting image:', err);
        displayError('Failed to export image. Please try again.');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    });
}

function saveAsSVG(topic) {
    if (!markmapInstance || !mindmapContainer) {
        displayError('No mindmap to save. Please generate one first.');
        return;
    }

    // Show saving indicator
    const saveBtn = document.getElementById('save-btn');
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;

    // Use setTimeout to break up the work and prevent UI freeze
    setTimeout(() => {
        try {
            const svgElement = mindmapContainer.querySelector('svg#markmap');
            if (!svgElement) {
                throw new Error('SVG element not found');
            }

            // Create a new SVG document with proper namespaces
            const svgDoc = document.implementation.createDocument(
                'http://www.w3.org/2000/svg',
                'svg',
                null
            );
            const svgRoot = svgDoc.documentElement;
            
            // Copy attributes in chunks
            const attributes = Array.from(svgElement.attributes);
            const chunkSize = 10;
            
            for (let i = 0; i < attributes.length; i += chunkSize) {
                const chunk = attributes.slice(i, i + chunkSize);
                chunk.forEach(attr => {
                    svgRoot.setAttribute(attr.name, attr.value);
                });
            }
            
            // Ensure required namespaces
            svgRoot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svgRoot.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            
            // Copy child nodes in chunks
            const nodes = Array.from(svgElement.childNodes);
            const nodeChunkSize = 5;
            
            for (let i = 0; i < nodes.length; i += nodeChunkSize) {
                const chunk = nodes.slice(i, i + nodeChunkSize);
                chunk.forEach(node => {
                    svgRoot.appendChild(svgDoc.importNode(node, true));
                });
            }

            // Add styles
            const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            style.textContent = `
                .markmap-foreign {
                    pointer-events: none;
                    overflow: visible;
                }
                .markmap-node-text {
                    font-size: 14px;
                    font-family: sans-serif;
                    white-space: nowrap;
                }
                .markmap-node circle {
                    fill: #3b82f6;
                    stroke: none;
                }
                .markmap-node line {
                    stroke: #999;
                    stroke-width: 1px;
                }
                .markmap-node text {
                    fill: currentColor;
                }
            `;
            svgRoot.insertBefore(style, svgRoot.firstChild);

            // Serialize in chunks if needed (for very large SVGs)
            const serializer = new XMLSerializer();
            let svgStr = serializer.serializeToString(svgDoc);
            
            // Add XML header
            svgStr = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
                     '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' + 
                     svgStr;

            // Create download in next tick
            setTimeout(() => {
                try {
                    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `mindmap_${topic.replace(/\s+/g, '_')}.svg`;
                    document.body.appendChild(a);
                    a.click();
                    
                    // Clean up in next tick
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        saveBtn.innerHTML = originalBtnText;
                        saveBtn.disabled = false;
                    }, 0);
                    
                } catch (error) {
                    console.error('Error creating download:', error);
                    displayError('Failed to create download. Please try again.');
                    saveBtn.innerHTML = originalBtnText;
                    saveBtn.disabled = false;
                }
            }, 0);
            
        } catch (error) {
            console.error('Error saving SVG:', error);
            displayError('Failed to save SVG. Please try again.');
            saveBtn.innerHTML = originalBtnText;
            saveBtn.disabled = false;
        }
    }, 0);
}

function saveInteractiveHTML(topic) {
    if (!markmapInstance || !currentMarkdown) {
        displayError('No mindmap to save. Please generate one first.');
        return;
    }

    try {
        const escapedMarkdown = currentMarkdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Mindmap - ${topic}</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background-color: var(--background-color, white); color: var(--text-color, black); }
        svg { width: 100%; height: 100vh; font-family: sans-serif; }
        .markmap-node-text { font-size: 14px; }
        .markmap-node circle { fill: #3b82f6; }
        .error-message { color: red; padding: 20px; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.15.4"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-view@0.15.4"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            try {
                const { Transformer, Markmap } = window.markmap;
                const transformer = new Transformer();
                const markdown = \`${escapedMarkdown}\`;
                const { root } = transformer.transform(markdown);
                if (!root) throw new Error('Failed to transform markdown');
                const svg = document.querySelector('#markmap');
                const markmap = Markmap.create(svg, {
                    duration: 500, 
                    nodeFont: '14px sans-serif',
                    color: (node) => node?.data?.color || '#3b82f6',
                    paddingX: 15, 
                    zoom: true, 
                    pan: true, 
                    maxWidth: 300,
                    colorFreezeLevel: 2, 
                    initialExpandLevel: 2
                }, root);
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

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mindmap_${topic.replace(/\s+/g, '_')}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error saving interactive HTML:', error);
        displayError('Failed to save interactive mindmap. Please try again.');
    }
}

// --- DOMContentLoaded: Initialize and Attach Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    setupSavePopup();
    // Assign DOM Elements to global variables
    topicInput = document.getElementById('topic-input');
    generateBtn = document.getElementById('generate-btn');
    inputContainer = document.getElementById('input-container');
    mindmapContainer = document.getElementById('mindmap-container');
    loadingIndicator = document.getElementById('loading-indicator');
    errorMessageElement = document.getElementById('error-message');
    historyListElement = document.getElementById('history-list');
    zoomControlsElement = document.querySelector('.zoom-controls');

    // Initialize Markmap Transformer
    if (window.markmap && window.markmap.Transformer) {
        transformer = new window.markmap.Transformer();
    } else {
        console.error("Markmap library not loaded correctly!");
        displayError("Critical error: Markmap library failed to load. Please refresh.");
        return; // Stop further execution if Markmap is not available
    }
 
    // Verify all critical DOM elements are found
    if (!topicInput || !generateBtn || !inputContainer || !mindmapContainer || !loadingIndicator || !errorMessageElement || !historyListElement || !zoomControlsElement) {
        console.error('Critical DOM elements missing after DOMContentLoaded. Check IDs in HTML or .zoom-controls class.');
        displayError("Page elements missing. Please refresh or check console.");
        return;
    }
    
    // Initial UI setup
    clearError();
    if (zoomControlsElement) {
        zoomControlsElement.classList.add('hidden'); // Hide zoom controls initially
    }
    clearPreviousResults(); // Set initial state (input form visible), also hides zoom controls
    renderHistoryList();    // Populate history list

    // Event Listener for Save History Label
    const saveHistoryLabel = document.getElementById('save-history-label');
    if (saveHistoryLabel) {
        saveHistoryLabel.addEventListener('click', () => {
            const topic = topicInput.value.trim() || 'Untitled Mindmap';
            if (!currentMarkdown) { // Check global currentMarkdown
                displayError('No mindmap to save to history. Please generate one first.');
                return;
            }
            const svgElementForSave = mindmapContainer.querySelector('svg#markmap');
            const mindmapState = {
                title: topic,
                markdown: currentMarkdown,
                svg: svgElementForSave ? svgElementForSave.outerHTML : '',
                timestamp: Date.now(),
                topic: currentTopic // Use global currentTopic
            };
            saveToHistory(mindmapState);
        });
    }

    // History Toggle and Save Functionality
    const historyToggleBtn = document.getElementById('history-toggle-btn');
    const historyPopup = document.querySelector('.history-popup');
    const historyHeader = document.querySelector('.history-header');
    if (historyToggleBtn && historyPopup && historyHeader) {
        historyToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            historyPopup.classList.toggle('show');
        });

        historyHeader.addEventListener('click', () => {
            const topic = topicInput.value.trim() || 'Untitled Mindmap';
            if (!currentMarkdown) {
                displayError('No mindmap to save to history. Please generate one first.');
                return;
            }
            const svgElementForSave = mindmapContainer.querySelector('svg#markmap');
            const mindmapState = {
                title: topic,
                markdown: currentMarkdown,
                svg: svgElementForSave ? svgElementForSave.outerHTML : '',
                timestamp: Date.now(),
                topic: currentTopic
            };
            saveToHistory(mindmapState);
        });
    }
    
    // Close popup when clicking outside
    document.addEventListener('click', (e) => {
        if (historyPopup && !e.target.closest('.history-toggle-container')) {
            historyPopup.classList.remove('show');
        }
    });

    // Theme Management
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        const storedTheme = localStorage.getItem('theme');
        const currentTheme = storedTheme || (prefersDarkScheme.matches ? 'dark' : 'light');

        if (currentTheme === 'dark') {
            document.body.classList.add('dark');
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            themeToggleBtn.title = 'Toggle light mode';
        } else {
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            themeToggleBtn.title = 'Toggle dark mode';
        }
        document.getElementById('purpose').value = 'personal'; // Set default purpose

        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            themeToggleBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            themeToggleBtn.title = isDark ? 'Toggle light mode' : 'Toggle dark mode';
        });
    }


    // Generate Button Event Listener
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerateMindMap);
    }

    // Zoom Controls
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');

    if (zoomInBtn && zoomOutBtn && zoomResetBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (markmapInstance && markmapInstance.state && typeof markmapInstance.state.k === 'number' && isFinite(markmapInstance.state.k) && typeof markmapInstance.rescale === 'function') {
                markmapInstance.rescale(markmapInstance.state.k * 1.2);
            } else {
                console.warn('Zoom In: markmapInstance, state, state.k, or rescale method not available or k is invalid.', markmapInstance);
            }
        });

        zoomOutBtn.addEventListener('click', () => {
            if (markmapInstance && markmapInstance.state && typeof markmapInstance.state.k === 'number' && isFinite(markmapInstance.state.k) && typeof markmapInstance.rescale === 'function') {
                markmapInstance.rescale(markmapInstance.state.k * 0.8);
            } else {
                console.warn('Zoom Out: markmapInstance, state, state.k, or rescale method not available or k is invalid.', markmapInstance);
            }
        });

        zoomResetBtn.addEventListener('click', () => {
            if (markmapInstance && typeof markmapInstance.fit === 'function') {
                markmapInstance.fit();
            } else {
                console.warn('Zoom Reset: markmapInstance or fit method not available.', markmapInstance);
            }
        });
    }
    
    // Detail Level Image Selection
    const detailLevelItems = document.querySelectorAll('.detail-level-item');
    detailLevelItems.forEach(item => {
        const img = item.querySelector('.detail-level-img');
        if (img) {
            // Set initial active state based on global selectedDetailLevel
            if (img.dataset.level === selectedDetailLevel) {
                img.classList.add('active');
            }

            item.addEventListener('click', () => {
                document.querySelectorAll('.detail-level-img').forEach(i => i.classList.remove('active'));
                img.classList.add('active');
                selectedDetailLevel = img.dataset.level; // Update global
            });
        }
    });

    // Home Button Functionality
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => location.reload());
    }

    // Enhanced Save (Download) Button Functionality
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const topicToSave = topicInput.value.trim() || 'Untitled Mindmap';
            if (!markmapInstance || !currentMarkdown) { // Check both instance and markdown
                displayError('No mindmap to save. Please generate one first.');
                return;
            }

            try {
                const escapedMarkdown = currentMarkdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Mindmap - ${topicToSave}</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background-color: var(--background-color, white); color: var(--text-color, black); }
        svg { width: 100%; height: 100vh; font-family: sans-serif; }
        .markmap-node-text { font-size: 14px; }
        .markmap-node circle { fill: #3b82f6; }
        .error-message { color: red; padding: 20px; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.15.4"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-view@0.15.4"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            try {
                const { Transformer, Markmap } = window.markmap;
                const transformer = new Transformer();
                const markdown = \`${escapedMarkdown}\`;
                const { root } = transformer.transform(markdown);
                if (!root) throw new Error('Failed to transform markdown');
                const svg = document.querySelector('#markmap');
                const markmap = Markmap.create(svg, {
                    duration: 500, nodeFont: '14px sans-serif',
                    color: (node) => node?.data?.color || '#3b82f6',
                    paddingX: 15, zoom: true, pan: true, maxWidth: 300,
                    colorFreezeLevel: 2, initialExpandLevel: 4
                }, root);
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

                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mindmap_${topicToSave.replace(/\s+/g, '_')}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error saving mindmap:', error);
                displayError('Failed to save mindmap. Please try again.');
            }
        });
    }
});
