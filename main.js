const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
require('dotenv').config();

async function getTweets(tweetUrls) {

    let response = await fetch(`https://api.apify.com/v2/acts/quacker~twitter-url-scraper/runs?token=${process.env.APIFY_TOKEN}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            addUserInfo: true,
            startUrls: tweetUrls.map(url => ({url: url})),
            tweetsDesired: tweetUrls.length,
        }),
    });

    if (!response.ok) {
        console.error("API request failed with status:", response.status);
        const text = await response.text();
        console.error("Failed response body:", text);
        throw new Error(`API request failed with status: ${response.status}`);
    }

    const id = (await response.json()).data.defaultDatasetId;
    console.log(id);

    console.log("Waiting for data to be scraped...");
    await new Promise(resolve => setTimeout(resolve, 90000));

    response = await fetch(`https://api.apify.com/v2/datasets/${id}/items?format=json&token=${process.env.APIFY_TOKEN}`, {
        method: 'GET',
        headers: {'Content-Type': 'application/json'}
    });

    if (!response.ok) {
        console.error("API request failed with status:", response.status);
        const text = await response.text();
        console.error("Failed response body:", text);
        throw new Error(`API request failed with status: ${response.status}`);
    }
    const data = await response.json();
    
    return data.map(tweet => {
        return {
            id: tweet.id,
            name: tweet.user.name,
            username: tweet.user.screen_name,
            verified: tweet.user.verified,
            text: tweet.full_text,
            pfp: tweet.user.profile_image_url_https,
            date: tweet.created_at,
        }
    });
}

async function printTweets(tweets) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });

    for (let tweet of tweets) {
        await page.setContent(`
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@^2.0/dist/tailwind.min.css" rel="stylesheet">
                    <style>
                        svg {
                            fill: #1d9bf0;
                        }
                    </style>
                </head>
                <body class="bg-black flex justify-center items-center text-white text-6xl p-16">
                    <main class="flex flex-col gap-6 w-full h-fit">
                        <div class="flex justify-start gap-6">
                            <img src="${tweet.pfp}" alt="Profile Picture" width="50" height="50" class="rounded-full flex-shrink-0 aspect-square w-32 h-32">
                            <div class="flex flex-col justify-center items-start">
                                <div class="flex gap-4 items-baseline">
                                    <p class="font-semibold">${tweet.name}</p>
                                    <div class="relative w-16 h-16">
                                        <svg viewBox="0 0 22 22" aria-label="Verified account" role="img" class="absolute top-2 left-0 h-16 w-16" data-testid="icon-verified">
                                            <g>
                                            <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"></path>
                                            </g>
                                        </svg>
                                    </div>
                                </div>
                                <p class="font-light text-gray-300">@${tweet.username}</p>    
                            </div>
                        </div>
                        <p class="font-normal">${tweet.text}</p>
                    </main>
                </body>
            </html>
        `);
        screenshotPath = `tweet___${tweet.username}-${Date.now().toString().slice(8)}.png`;
        await page.screenshot({ path: screenshotPath });
        const videoPath = screenshotPath.replace('.png', '.mp4');
        await new Promise((resolve, reject) => {
            ffmpeg(screenshotPath)
                .loop(5) // Duration of 5 seconds
                .fps(25) // Frame rate
                .size('1080x1920') // Same as viewport size
                .addOptions([
                    '-c:v libx264', // Use the H.264 codec for video encoding
                    '-crf 18', // Set the Constant Rate Factor to 18 (range is 0–51, where 0 is lossless, 23 is default, and 51 is worst quality)
                    '-pix_fmt yuv420p', // Use the yuv420p pixel format for better compatibility
                    '-preset veryslow' // Use the veryslow preset for better compression (at the cost of encoding speed)
                ])
                .output(videoPath)
                .on('end', async function() {
                    console.log('> video created:', videoPath);
                    try {
                        await fs.unlink(screenshotPath);
                    } catch (err) {
                        console.error('Error deleting original image:', err);
                    }
                    resolve();
                })
                .on('error', function(err) {
                    console.error('Error converting image to video:', err);
                    reject(err);
                })
                .run();
        });
    };
    console.log("DONE");
    await browser.close();
};

if (process.argv.length < 3) {
    console.error("Usage: node main.js <tweet_url_1> <tweet_url_2> ...");
    process.exit(1);
} else {
    getTweets(process.argv.slice(2)).then(printTweets).catch(console.error);
}
