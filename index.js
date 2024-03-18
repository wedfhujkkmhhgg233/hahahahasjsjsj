const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: 8080 }); // WebSocket server

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static('public'));

let timer = null;
let requestCount = 0;
const maxRequestsPerHour = 100000; // Max requests per hour
const requestInterval = 1000 * 60 * 60 / maxRequestsPerHour; // Interval between each request in milliseconds

// Function to share a post
async function sharePost(accessToken, shareUrl) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/me/feed?access_token=${accessToken}&fields=id&limit=1&published=0`,
      {
        link: shareUrl,
        privacy: { value: 'SELF' },
        no_story: true,
      }
    );

    const postId = response?.data?.id;

    if (!postId) {
      throw new Error('Failed to share post: Unknown error');
    }

    console.log(`Post shared: ${postId}`);
    return postId;
  } catch (error) {
    console.error('Failed to share post:', error.response?.data?.error?.message || 'Unknown error');
    throw error;
  }
}

// Function to delete a post
async function deletePost(accessToken, postId) {
  try {
    await axios.delete(`https://graph.facebook.com/${postId}?access_token=${accessToken}`);
    console.log(`Post deleted: ${postId}`);
  } catch (error) {
    console.error('Failed to delete post:', error.response?.data?.error?.message || 'Unknown error');
    throw error;
  }
}

// WebSocket server
wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });
});

// Route to start sharing posts
app.post('/share', async (req, res) => {
  const { accessToken, shareUrl, shareAmount, shareInterval } = req.body;
  let sharedCount = 0;

  try {
    // Start sharing posts
    timer = setInterval(async () => {
      try {
        if (requestCount >= maxRequestsPerHour) {
          clearInterval(timer);
          console.log('Exceeded rate limit. Stopping sharing.');
          return;
        }

        const postId = await sharePost(accessToken, shareUrl);
        sharedCount++;
        requestCount++;

        if (sharedCount === parseInt(shareAmount)) {
          clearInterval(timer);
          console.log('Finished sharing posts.');

          setTimeout(async () => {
            await deletePost(accessToken, postId);
          }, deleteAfter * 1000);
        }
      } catch (error) {
        clearInterval(timer);
        console.log('Loop stopped due to error.');
      }
    }, parseInt(shareInterval) * 1000);

    res.status(200).send('Sharing started.');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Route to stop sharing posts
app.post('/stop', (req, res) => {
  clearInterval(timer);
  console.log('Loop stopped.');
  res.status(200).send('Sharing stopped.');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});