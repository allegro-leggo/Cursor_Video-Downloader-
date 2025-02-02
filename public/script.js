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

    let videoFormats = [];

    // Helper function to show error messages
    function showError(message) {
        alert(message);
        videoInfo.classList.add('hidden');
        videoTitle.textContent = '';
        videoFormats = [];
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
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch video information');
            }

            if (!data.formats || data.formats.length === 0) {
                throw new Error('No available formats found for this video');
            }

            videoTitle.textContent = data.title;
            videoFormats = data.formats;
            updateQualityOptions();
            videoInfo.classList.remove('hidden');
        } catch (error) {
            showError(error.message);
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
                .filter(format => format.hasVideo && format.hasAudio) // Only show formats with both video and audio
                .map(format => format.quality)
        )].filter(Boolean).sort((a, b) => {
            // Sort qualities in descending order
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
        const url = videoUrlInput.value.trim();
        const isAudio = downloadType.value === 'audio';
        const quality = qualitySelector.value;

        if (!url || !isValidYouTubeUrl(url)) {
            showError('Please enter a valid YouTube URL');
            return;
        }

        let downloadUrl = `/download?url=${encodeURIComponent(url)}&isAudio=${isAudio}`;
        
        if (!isAudio && quality) {
            const selectedFormat = videoFormats.find(f => f.quality === quality);
            if (selectedFormat) {
                downloadUrl += `&quality=${selectedFormat.itag}`;
            }
        }

        try {
            downloadBtn.disabled = true;
            progressContainer.classList.remove('hidden');
            
            const response = await fetch(downloadUrl);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Download failed');
            }

            const reader = response.body.getReader();
            const contentLength = response.headers.get('Content-Length');
            
            let receivedLength = 0;
            const chunks = [];

            while(true) {
                const {done, value} = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                receivedLength += value.length;
                
                if (contentLength) {
                    const progress = (receivedLength / contentLength) * 100;
                    progressBar.style.width = progress + '%';
                    progressText.textContent = Math.round(progress) + '%';
                }
            }

            const blob = new Blob(chunks);
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = isAudio ? 'audio.mp3' : 'video.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);

        } catch (error) {
            showError('Error downloading: ' + error.message);
        } finally {
            downloadBtn.disabled = false;
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
        }
    });
}); 