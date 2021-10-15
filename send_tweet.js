// @ts-check

//call like node send_tweet.js TWEET
//api keys & auth for current user are passed in environment variables

const { TwitterApi, ApiRequestError, ApiResponseError, EApiV1ErrorCode } = require('twitter-api-v2');

var fs = require('fs');

const { convert, createPuppet, destroyPuppet } = require('render-svgs-with-puppeteer');
const fetch = require('node-fetch');
const FileType = require('file-type');


async function send_tweet(tweet) {

	const T = new TwitterApi({
		appKey: process.env.TWITTER_CONSUMER_KEY,
		appSecret: process.env.TWITTER_CONSUMER_SECRET,
		accessToken: process.env.ACCESS_TOKEN,
		accessSecret: process.env.ACCESS_TOKEN_SECRET
	}).readWrite;


	var tweet_without_image = removeBrackets(tweet);

	let params = { status: tweet_without_image };

	var media_tags = matchBrackets(tweet);

	if (media_tags) {
		try {
			var svgPuppet = undefined;
			if (media_tags.every(x => x.indexOf("svg ") === 1)) {
				svgPuppet = await createPuppet();
			}
			var media_promises = media_tags.map(tag => render_media_tag(tag, T, svgPuppet));
			var medias = await Promise.all(media_promises);
			params.media_ids = medias;

			if (svgPuppet) {
				await destroyPuppet(svgPuppet);
			}
		}
		catch (e) {
			if (e instanceof ApiRequestError) {
				console.log("Couldn't upload media, request failed - please try again.");
				process.exit(1);
			}
			else if (e instanceof ApiResponseError) {
				if (e.code !== 200) {
					if (e.code == 401) {
						console.log("Can't upload media. Twitter error: Not authorized");
						process.exit(1);
					}
					if (e.code == 403) {
						console.log("Can't upload media. Twitter error: Forbidden");
						process.exit(1);
					}
					if (e.code == 400) {
						console.log("Can't upload media. Twitter error: Bad request");
						process.exit(1);
					}
					else {
						console.log("Can't upload media. Twitter error: " + e.code);
						process.exit(1);
					}
				}
				else {
					if ("code" in e.errors[0]) {
						console.log("Can't upload media. Twitter error: " + e.errors[0].code);
						process.exit(1);
					}
					else {
						console.log("Can't upload media. Twitter error: Unknown error");
						process.exit(1);
					}
				}
			}
			else {
				console.log("Can't render or upload media. Unknown error: " + e);
				process.exit(1);
			}
		}
	}

	try {
		const resp = await T.v1.tweet(params.status, params);
	}
	catch (e) {
		if (e instanceof ApiRequestError) {
			console.log("Internal error:" + e.requestError);
			process.exit(1);
		}
		else if (e instanceof ApiResponseError) {

			if (e.hasErrorCode(EApiV1ErrorCode.TweetTextTooLong)) {
				console.log("Tweet over 280 characters");
				process.exit(1);
			}

			else if (e.hasErrorCode(EApiV1ErrorCode.DuplicatedTweet)) {

				console.log("Twitter error: Tweet is a duplicate of previous tweet");
				process.exit(1);
			}
			else if (e.hasErrorCode(170)) { //empty tweet

				console.log("Twitter error: Empty tweet");
				process.exit(1);
			}
			else if (e.hasErrorCode(EApiV1ErrorCode.YouAreSuspended)) {

				console.log("Twitter error: Account suspended");
				process.exit(1);
			}
			else if (e.hasErrorCode(EApiV1ErrorCode.InvalidOrExpiredToken)) {

				console.log("Twitter error: Invalid permissions");
				process.exit(1);
			}
			else if (e.hasErrorCode(EApiV1ErrorCode.AccountLocked)) {

				console.log("Twitter error: Account suspended");
				process.exit(1);
			}
			else if (e.hasErrorCode(EApiV1ErrorCode.RequestLooksLikeSpam)) {

				console.log("Twitter error: Tweet flagged as spam");
				process.exit(1);
			}
			else {
				if ('code' in e.errors[0]) {
					console.log("Twitter error: Unknown error (" + e.errors[0].code + ")");
					process.exit(1);
				}
				else {
					console.log("Twitter error: Unknown error (" + e.code + ")");
					process.exit(1);

				}
			}
		}
	}
}



/**
 * @param {string} svg_text
 * @param {import("twitter-api-v2").TwitterApiReadWrite} T
 * @param {import("render-svgs-with-puppeteer").Browser} svgPuppet
 * @returns {Promise<string>}
 */
async function generate_svg(svg_text, T, svgPuppet) {
	const data = await convert(svg_text, svgPuppet);
	let media_id = await uploadMedia(data, T);
	return media_id;
}

async function fetch_img(url, T) {
	let response = await fetch(url);
	if (response.ok) {
		let buffer = await response.buffer();
		let media_id = await uploadMedia(buffer, T);
		return media_id;
	}
	else {
		console.log("Couldn't fetch " + url + " (" + response.statusText + ")");
		process.exit(1);
	}
}

async function uploadMedia(buffer, T) {

	const mimeType = (await FileType.fromBuffer(buffer)).mime;
	const mediaId = await T.v1.uploadMedia(buffer, { type: mimeType });

	return mediaId;
}


/**
 * @param {string} match
 * @param {import("twitter-api-v2").TwitterApiReadWrite} T
 * @param {import("render-svgs-with-puppeteer").Browser|undefined} svgPuppet
 */
function render_media_tag(match, T, svgPuppet) {
	var unescapeOpenBracket = /\\{/g;
	var unescapeCloseBracket = /\\}/g;
	match = match.replace(unescapeOpenBracket, "{");
	match = match.replace(unescapeCloseBracket, "}");

	if (match.indexOf("svg ") === 1) {
		return generate_svg(match.substr(5, match.length - 6), T, svgPuppet);
	}
	else if (match.indexOf("img ") === 1) {
		return fetch_img(match.substr(5, match.length - 6), T);
	}
	else {
		throw (new Error("error {" + match.substr(1, 4) + "... not recognized"));
	}
}

// this is much more complex than i thought it would be
// but this function will find our image tags 
// full credit to BooDooPerson - https://twitter.com/BooDooPerson/status/683450163608817664
// Reverse the string, check with our fucked up regex, return null or reverse matches back
/**
 * @param {string} text
 * @returns {string[]}
 */
function matchBrackets(text) {

	// simple utility function
	function reverseString(s) {
		return s.split('').reverse().join('');
	}

	// this is an inverstion of the natural order for this RegEx:
	var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

	text = reverseString(text);
	var matches = text.match(bracketsRe);
	if (matches === null) {
		return null;
	}
	else {
		return matches.map(reverseString).reverse();
	}
}


//see matchBrackets for why this is like this
function removeBrackets(text) {

	// simple utility function
	var reverseString = function (s) {
		return s.split('').reverse().join('');
	}

	// this is an inverstion of the natural order for this RegEx:
	var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

	text = reverseString(text);
	return reverseString(text.replace(bracketsRe, ""));
}



send_tweet(fs.readFileSync('/dev/stdin').toString());

