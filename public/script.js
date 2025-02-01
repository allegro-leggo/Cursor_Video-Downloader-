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

    fetchInfoBtn.addEventListener('click', async () => {
        const url = videoUrlInput.value.trim();
        if (!url) {
            showError('Please enter a YouTube URL');
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
                .filter(format => format.hasVideo)
                .map(format => format.quality)
        )].filter(Boolean);

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

        let downloadUrl = `/download?url=${encodeURIComponent(url)}&isAudio=${isAudio}`;
        
        if (!isAudio) {
            const selectedFormat = videoFormats.find(f => f.quality === quality);
            if (selectedFormat) {
                downloadUrl += `&quality=${selectedFormat.itag}`;
            }
        }

        try {
            downloadBtn.disabled = true;
            progressContainer.classList.remove('hidden');
            
            const response = await fetch(downloadUrl);
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
            alert('Error downloading: ' + error.message);
        } finally {
            downloadBtn.disabled = false;
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
        }
    });
}); 