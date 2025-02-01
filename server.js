const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

ffmpeg.setFfmpegPath(ffmpegPath);

app.use(express.static('public'));
app.use(express.json());

// Helper function to validate YouTube URL
function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
}

app.get('/video-info', async (req, res) => {
    try {
        const videoURL = req.query.url;

        if (!videoURL) {
            return res.status(400).json({ error: 'Please provide a YouTube URL' });
        }

        if (!isValidYouTubeUrl(videoURL)) {
            return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
        }

        const info = await ytdl.getInfo(videoURL);
        const formats = info.formats.map(format => ({
            itag: format.itag,
            quality: format.qualityLabel || format.quality,
            hasAudio: format.hasAudio,
            hasVideo: format.hasVideo,
            container: format.container,
            contentLength: format.contentLength
        }));

        res.json({
            title: info.videoDetails.title,
            formats: formats.filter(format => format.hasVideo || format.hasAudio)
        });
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({ 
            error: error.message || 'An error occurred while fetching video information'
        });
    }
});

app.get('/download', async (req, res) => {
    try {
        const { url, format, quality, isAudio } = req.query;
        const info = await ytdl.getInfo(url);
        const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');

        if (isAudio === 'true') {
            res.header('Content-Disposition', `attachment; filename="${videoTitle}.mp3"`);
            const audio = ytdl(url, { quality: 'highestaudio' });
            
            ffmpeg(audio)
                .toFormat('mp3')
                .on('end', () => console.log('Conversion finished'))
                .on('error', error => console.error(error))
                .pipe(res);
        } else {
            res.header('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
            ytdl(url, {
                quality: quality,
                format: format
            }).pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 