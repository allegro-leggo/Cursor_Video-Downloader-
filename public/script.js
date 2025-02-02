let videoTitle = '';

document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('videoUrl');
    const fetchInfoBtn = document.getElementById('fetchInfo');
    const videoInfoDiv = document.getElementById('videoInfo');
    const downloadTypeSelect = document.getElementById('downloadType');
    const qualitySelect = document.getElementById('quality');
    const downloadBtn = document.getElementById('downloadBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const videoTitleElement = document.getElementById('videoTitle');
    const connectionStatus = document.getElementById('connectionStatus');
    const connectionText = document.getElementById('connectionText');
    const connectionIcon = document.getElementById('connectionIcon');

    let videoFormats = [];
    let isConnected = true;

    // Function to update connection status
    function updateConnectionStatus(online) {
        isConnected = online;
        if (online) {
            connectionStatus.className = 'connection-status connected';
            connectionText.textContent = 'Connected to the Internet';
            connectionIcon.textContent = '●';
            fetchInfoBtn.disabled = false;
            downloadBtn.disabled = false;
        } else {
            connectionStatus.className = 'connection-status disconnected';
            connectionText.textContent = 'No Internet Connection';
            connectionIcon.textContent = '○';
            fetchInfoBtn.disabled = true;
            downloadBtn.disabled = true;
        }
    }

    // Initial connection check
    updateConnectionStatus(navigator.onLine);

    // Listen for online/offline events
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));

    // Helper function to show error messages
    function showError(message) {
        alert(message);
        if (!videoFormats.length) {
            videoInfoDiv.classList.add('hidden');
            videoTitleElement.textContent = '';
            videoFormats = [];
        }
    }

    // Helper function to validate YouTube URL
    function isValidYouTubeUrl(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        return youtubeRegex.test(url);
    }

    fetchInfoBtn.addEventListener('click', async () => {
        const videoUrl = videoUrlInput.value.trim();
        if (!videoUrl) {
            showError('Please enter a YouTube URL');
            return;
        }

        if (!isValidYouTubeUrl(videoUrl)) {
            showError('Please enter a valid YouTube URL');
            return;
        }

        try {
            fetchInfoBtn.disabled = true;
            fetchInfoBtn.textContent = 'Fetching...';

            const response = await fetch(`/video-info?url=${encodeURIComponent(videoUrl)}`);
            
            if (!response.ok) {
                const text = await response.text();
                console.error('Server response:', text);
                throw new Error('Failed to fetch video information');
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            videoTitle = data.title;
            videoTitleElement.textContent = videoTitle;
            videoFormats = data.formats;
            updateQualityOptions();
            videoInfoDiv.classList.remove('hidden');
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            updateConnectionStatus(true); // Update connection status on successful fetch
        } catch (error) {
            console.error('Error details:', error);
            showError(error.message || 'An error occurred while fetching video information');
            // Only update connection status if it's a network error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                updateConnectionStatus(false);
            }
        } finally {
            fetchInfoBtn.disabled = false;
            fetchInfoBtn.textContent = 'Fetch Video Info';
        }
    });

    downloadTypeSelect.addEventListener('change', updateQualityOptions);

    function updateQualityOptions() {
        qualitySelect.innerHTML = '';
        const isAudio = downloadTypeSelect.value === 'audio';

        if (isAudio) {
            qualitySelect.parentElement.classList.add('hidden');
            return;
        }

        qualitySelect.parentElement.classList.remove('hidden');
        
        const sortedFormats = videoFormats.sort((a, b) => {
            const getQualityNumber = (quality) => {
                if (!quality) return 0;
                const match = quality.match(/(\d+)p/);
                return match ? parseInt(match[1]) : 0;
            };
            return getQualityNumber(b.quality) - getQualityNumber(a.quality);
        });

        const addedQualities = new Set();
        sortedFormats.forEach(format => {
            if (format.hasVideo && !addedQualities.has(format.quality)) {
                const option = document.createElement('option');
                option.value = format.quality;
                option.textContent = `${format.quality}${format.fps !== 'N/A' ? ` (${format.fps}fps)` : ''}`;
                qualitySelect.appendChild(option);
                addedQualities.add(format.quality);
            }
        });
    }

    downloadBtn.addEventListener('click', async () => {
        if (!isConnected) {
            showError('No internet connection. Please check your connection and try again.');
            return;
        }

        const videoUrl = videoUrlInput.value.trim();
        const isAudio = downloadTypeSelect.value === 'audio';
        const quality = qualitySelect.value;

        if (!videoUrl || !isValidYouTubeUrl(videoUrl)) {
            showError('Please enter a valid YouTube URL');
            return;
        }

        try {
            downloadBtn.disabled = true;
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            
            const downloadUrl = `/download?url=${encodeURIComponent(videoUrl)}&quality=${encodeURIComponent(quality)}&isAudio=${isAudio}`;
            const response = await fetch(downloadUrl);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Download failed');
            }

            const contentLength = response.headers.get('content-length');
            const reader = response.body.getReader();
            let receivedLength = 0;

            // Create a new ReadableStream to handle the download
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        while (true) {
                            const {done, value} = await reader.read();
                            
                            if (done) {
                                controller.close();
                                break;
                            }

                            receivedLength += value.length;
                            
                            if (contentLength) {
                                const progress = (receivedLength / contentLength) * 100;
                                progressBar.style.width = `${Math.min(100, progress.toFixed(1))}%`;
                                progressText.textContent = `${Math.min(100, progress.toFixed(1))}%`;
                            }
                            
                            controller.enqueue(value);
                        }
                    } catch (error) {
                        controller.error(error);
                        throw error;
                    }
                }
            });

            // Convert stream to blob and download
            const blob = await new Response(stream).blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${videoTitle}${isAudio ? '.mp3' : '.mp4'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);

            // Show completion
            progressBar.style.width = '100%';
            progressText.textContent = '100%';
            
            // Reset progress after a short delay
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                progressBar.style.width = '0%';
                progressText.textContent = '0%';
            }, 2000);

        } catch (error) {
            console.error('Download error:', error);
            showError('Error downloading: ' + error.message);
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                updateConnectionStatus(false);
            }
        } finally {
            downloadBtn.disabled = false;
        }
    });
}); 