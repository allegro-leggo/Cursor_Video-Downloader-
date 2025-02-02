const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

ffmpeg.setFfmpegPath(ffmpegPath);

// Enable CORS for all routes
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// Helper function to validate YouTube URL
function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
}

app.get('/video-info', async (req, res) => {
    try {
        console.log('Received video-info request:', req.query);
        const videoURL = req.query.url;

        if (!videoURL) {
            console.log('No URL provided');
            return res.status(400).json({ error: 'Please provide a YouTube URL' });
        }

        if (!isValidYouTubeUrl(videoURL)) {
            console.log('Invalid URL format:', videoURL);
            return res.status(400).json({ error: 'Please provide a valid YouTube URL' });
        }

        console.log('Fetching video info for:', videoURL);
        const info = await ytdl.getInfo(videoURL);
        console.log('Video info fetched successfully');

        const formats = info.formats
            .filter(format => !format.qualityLabel?.includes('2160p')) // Exclude 4K for stability
            .map(format => ({
                itag: format.itag,
                quality: format.qualityLabel || format.quality,
                hasAudio: format.hasAudio,
                hasVideo: format.hasVideo,
                container: format.container,
                contentLength: format.contentLength,
                mimeType: format.mimeType
            }));

        const response = {
            title: info.videoDetails.title,
            formats: formats.filter(format => format.hasVideo || format.hasAudio)
        };
        console.log('Sending response with', response.formats.length, 'formats');
        res.json(response);
    } catch (error) {
        console.error('Error in /video-info:', error);
        res.status(500).json({ 
            error: error.message || 'An error occurred while fetching video information'
        });
    }
});

app.get('/download', async (req, res) => {
    try {
        const { url, quality, isAudio } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        if (!isValidYouTubeUrl(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const info = await ytdl.getInfo(url);
        const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');

        if (isAudio === 'true') {
            res.header('Content-Disposition', `attachment; filename="${videoTitle}.mp3"`);
            const audio = ytdl(url, { 
                quality: 'highestaudio',
                filter: 'audioonly'
            });
            
            ffmpeg(audio)
                .toFormat('mp3')
                .audioBitrate(192)
                .on('end', () => console.log('Audio conversion finished'))
                .on('error', error => {
                    console.error('FFmpeg error:', error);
                    res.status(500).json({ error: 'Error converting audio' });
                })
                .pipe(res);
        } else {
            res.header('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
            const format = quality ? { quality, filter: format => format.itag === quality } : { quality: 'highest' };
            
            ytdl(url, format)
                .on('error', (error) => {
                    console.error('YTDL error:', error);
                    res.status(500).json({ error: 'Error downloading video' });
                })
                .pipe(res);
        }
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ 
            error: error.message || 'An error occurred while downloading'
        });
    }
});

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 