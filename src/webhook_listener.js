import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

class WebhookListener {
	listen() {
		app.get('/kofi', (req, res) => {
			res.send('Hello');
		});

		app.listen(PORT);
	}
}

const listener = new WebhookListener();
listener.listen();

export default listener;