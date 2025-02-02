const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const cors = require('cors');
const path = require('path');

console.log('Starting server initialization...');

// Wrap the main server setup in a try-catch block
try {
    const app = express();
    const port = process.env.PORT || 4000;
    const host = 'localhost';

    // Error handling for uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        console.error(error.stack);
    });

    process.on('unhandledRejection', (error) => {
        console.error('Unhandled Rejection:', error);
        console.error(error.stack);
    });

    // Middleware to log all requests
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });

    console.log('Checking FFmpeg path...');
    // Set up ffmpeg
    if (!ffmpegPath) {
        throw new Error('FFmpeg path not found');
    }
    console.log('FFmpeg path found:', ffmpegPath);
    ffmpeg.setFfmpegPath(ffmpegPath);

    // Enable CORS with specific options
    app.use(cors({
        origin: '*',  // Allow all origins in development
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true
    }));

    // Add headers to allow local development
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    // Serve static files
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());

    console.log('Setting up routes...');
    // Add a basic test route
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/test', (req, res) => {
        res.send('Server is working!');
    });

    // Helper function to validate YouTube URL
    function isValidYouTubeUrl(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        return youtubeRegex.test(url);
    }

    // Helper function to get video ID from URL
    function getVideoId(url) {
        try {
            return ytdl.getVideoID(url);
        } catch (error) {
            console.error('Error getting video ID:', error);
            return null;
        }
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

            const videoId = getVideoId(videoURL);
            if (!videoId) {
                return res.status(400).json({ error: 'Could not extract video ID from URL' });
            }

            console.log('Fetching video info for ID:', videoId);
            const info = await ytdl.getInfo(videoId);
            console.log('Video info fetched successfully');

            if (!info || !info.formats) {
                throw new Error('No video information available');
            }

            const formats = info.formats
                .filter(format => {
                    // Filter out formats without video or audio
                    if (!format.hasVideo && !format.hasAudio) return false;
                    // Remove 4K filter to allow all qualities
                    return true;
                })
                .map(format => ({
                    itag: format.itag,
                    quality: format.qualityLabel || format.quality,
                    hasAudio: format.hasAudio,
                    hasVideo: format.hasVideo,
                    container: format.container,
                    contentLength: format.contentLength,
                    mimeType: format.mimeType,
                    fps: format.fps || 'N/A'  // Add FPS information
                }));

            if (formats.length === 0) {
                throw new Error('No suitable formats found for this video');
            }

            const response = {
                title: info.videoDetails.title,
                formats: formats
            };
            console.log('Sending response with', formats.length, 'formats');
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
            console.log('Download request received:', { url, quality, isAudio });
            
            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }

            const videoId = getVideoId(url);
            if (!videoId) {
                return res.status(400).json({ error: 'Could not extract video ID from URL' });
            }

            console.log('Getting video info for ID:', videoId);
            const info = await ytdl.getInfo(videoId);
            console.log('Video info retrieved successfully');
            
            const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');

            if (isAudio === 'true') {
                console.log('Starting audio download');
                res.header('Content-Disposition', `attachment; filename="${videoTitle}.mp3"`);
                const audio = ytdl(url, { 
                    quality: 'highestaudio',
                    filter: 'audioonly'
                });
                
                console.log('Starting audio conversion');
                ffmpeg(audio)
                    .toFormat('mp3')
                    .audioBitrate(192)
                    .on('start', () => console.log('FFmpeg started processing'))
                    .on('progress', (progress) => {
                        if (progress.percent) {
                            console.log('Processing: ' + progress.percent.toFixed(2) + '% done');
                            // Send progress event
                            res.write(`data: ${JSON.stringify({ progress: progress.percent })}\n\n`);
                        }
                    })
                    .on('end', () => console.log('Audio conversion finished'))
                    .on('error', error => {
                        console.error('FFmpeg error:', error);
                        if (!res.headersSent) {
                            res.status(500).json({ error: 'Error converting audio' });
                        }
                    })
                    .pipe(res);
            } else {
                console.log('Starting video download with quality:', quality);
                res.header('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);

                // Get available formats
                const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
                console.log('Available formats:', formats.map(f => ({
                    quality: f.qualityLabel,
                    itag: f.itag,
                    container: f.container
                })));

                // Select the format
                let format;
                if (quality) {
                    format = formats.find(f => f.qualityLabel === quality) || formats[0];
                } else {
                    format = formats[0];
                }

                if (!format) {
                    throw new Error('No suitable format found');
                }

                console.log('Selected format:', {
                    quality: format.qualityLabel,
                    itag: format.itag,
                    container: format.container,
                    contentLength: format.contentLength
                });

                // Set content length header if available
                if (format.contentLength) {
                    res.header('Content-Length', format.contentLength);
                }

                ytdl(url, {
                    format: format
                })
                .on('progress', (chunkLength, downloaded, total) => {
                    const percent = (downloaded / total) * 100;
                    console.log(`Download progress: ${percent.toFixed(2)}%`);
                })
                .on('error', (error) => {
                    console.error('YTDL error:', error);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Error downloading video' });
                    }
                })
                .pipe(res);
            }
        } catch (error) {
            console.error('Download error:', error);
            console.error('Error stack:', error.stack);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: error.message || 'An error occurred while downloading'
                });
            }
        }
    });

    // Start the server
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`You can also try http://127.0.0.1:${port}`);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Please try a different port.`);
        } else {
            console.error('Server error:', error);
        }
        process.exit(1);
    });

} catch (error) {
    console.error('Fatal error during server startup:', error);
    console.error(error.stack);
    process.exit(1);
} 