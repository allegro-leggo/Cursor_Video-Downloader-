document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('videoUrl');
    const fetchInfoBtn = document.getElementById('fetchInfo');
    const videoInfo = document.getElementById('videoInfo');
    const videoTitle = document.getElementById('videoTitle');
    const downloadType = document.getElementById('downloadType');
    const qualitySelector = document.getElementById('quality');
    const downloadBtn = document.getElementById('downloadBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const connectionStatus = document.getElementById('connectionStatus');
    const connectionText = document.getElementById('connectionText');

    let videoFormats = [];
    let isConnected = true;

    // Function to update connection status
    function updateConnectionStatus(status = navigator.onLine) {
        isConnected = status;
        if (status) {
            connectionStatus.classList.remove('offline');
            connectionStatus.classList.add('online');
            connectionText.textContent = 'Connected to the Internet';
            fetchInfoBtn.disabled = false;
            downloadBtn.disabled = false;
        } else {
            connectionStatus.classList.remove('online');
            connectionStatus.classList.add('offline');
            connectionText.textContent = 'No Internet Connection';
            fetchInfoBtn.disabled = true;
            downloadBtn.disabled = true;
        }
    }

    // Initial connection check
    updateConnectionStatus();

    // Listen for online/offline events
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));

    // Helper function to show error messages
    function showError(message) {
        alert(message);
        if (!videoFormats.length) {
            videoInfo.classList.add('hidden');
            videoTitle.textContent = '';
            videoFormats = [];
        }
    }

    // Helper function to validate YouTube URL
    function isValidYouTubeUrl(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        return youtubeRegex.test(url);
    }

    fetchInfoBtn.addEventListener('click', async () => {
        const url = videoUrlInput.value.trim();
        if (!url) {
            showError('Please enter a YouTube URL');
            return;
        }

        if (!isValidYouTubeUrl(url)) {
            showError('Please enter a valid YouTube URL');
            return;
        }

        try {
            fetchInfoBtn.disabled = true;
            fetchInfoBtn.textContent = 'Fetching...';

            const response = await fetch(`/video-info?url=${encodeURIComponent(url)}`);
            
            if (!response.ok) {
                const text = await response.text();
                console.error('Server response:', text);
                throw new Error('Failed to fetch video information');
            }

            const data = await response.json();

            if (!data.formats || data.formats.length === 0) {
                throw new Error('No available formats found for this video');
            }

            videoTitle.textContent = data.title;
            videoFormats = data.formats;
            updateQualityOptions();
            videoInfo.classList.remove('hidden');
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

    downloadType.addEventListener('change', updateQualityOptions);

    function updateQualityOptions() {
        qualitySelector.innerHTML = '';
        const isAudio = downloadType.value === 'audio';

        if (isAudio) {
            qualitySelector.parentElement.classList.add('hidden');
            return;
        }

        qualitySelector.parentElement.classList.remove('hidden');
        
        const uniqueQualities = [...new Set(
            videoFormats
                .filter(format => format.hasVideo && format.hasAudio)
                .map(format => format.quality)
        )].filter(Boolean).sort((a, b) => {
            const aRes = parseInt(a.match(/\d+/)?.[0] || '0');
            const bRes = parseInt(b.match(/\d+/)?.[0] || '0');
            return bRes - aRes;
        });

        uniqueQualities.forEach(quality => {
            const option = document.createElement('option');
            option.value = quality;
            option.textContent = quality;
            qualitySelector.appendChild(option);
        });
    }

    downloadBtn.addEventListener('click', async () => {
        if (!isConnected) {
            showError('No internet connection. Please check your connection and try again.');
            return;
        }

        const url = videoUrlInput.value.trim();
        const isAudio = downloadType.value === 'audio';
        const quality = qualitySelector.value;

        if (!url || !isValidYouTubeUrl(url)) {
            showError('Please enter a valid YouTube URL');
            return;
        }

        try {
            downloadBtn.disabled = true;
            progressContainer.classList.remove('hidden');
            
            const downloadUrl = `/download?url=${encodeURIComponent(url)}&isAudio=${isAudio}${quality ? `&quality=${encodeURIComponent(quality)}` : ''}`;
            const response = await fetch(downloadUrl);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Download failed');
            }

            const contentLength = response.headers.get('Content-Length');
            const chunks = [];
            const reader = response.body.getReader();
            let receivedLength = 0;

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                chunks.push(value);
                receivedLength += value.length;
                
                if (contentLength) {
                    const progress = (receivedLength / contentLength) * 100;
                    progressBar.style.width = `${Math.min(100, progress)}%`;
                    progressText.textContent = `${Math.round(progress)}%`;
                }
            }

            const blob = new Blob(chunks);
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = isAudio ? 'audio.mp3' : 'video.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            updateConnectionStatus(true);
        } catch (error) {
            console.error('Download error:', error);
            showError('Error downloading: ' + error.message);
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                updateConnectionStatus(false);
            }
        } finally {
            downloadBtn.disabled = false;
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
        }
    });
}); 