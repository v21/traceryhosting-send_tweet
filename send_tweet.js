//call like node send_tweet.js TWEET
//api keys & auth for current user are passed in environment variables



var fs = require('fs');

var _ = require('underscore');

var Twit = require('twit');

var async = require('async');
var fs = require('fs');

const fetch = require('node-fetch');
const { convert } = require('convert-svg-to-png');

_.mixin({
	guid : function(){
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
	    return v.toString(16);
	  });
	}
});


var send_tweet = async function(tweet)
{

	var T = new Twit(
	{
	    consumer_key:         process.env.TWITTER_CONSUMER_KEY
	  , consumer_secret:      process.env.TWITTER_CONSUMER_SECRET
	  , access_token:         process.env.ACCESS_TOKEN
	  , access_token_secret:  process.env.ACCESS_TOKEN_SECRET
	}
	);

	await recurse_retry(5, tweet, T);

}

async function generate_svg(svg_text, T)
{
	const data = await convert(svg_text);
	let media_id = await uploadMedia(data.toString('base64'), T);
	return media_id;
}

var fetch_img = async function(url, T)
{
	let response = await fetch(url);
	if (response.ok)
	{
		let buffer = await response.buffer();
		let media_id = await uploadMedia(buffer.toString('base64'), T); //doesn't allow gifs/movies
		return media_id;
	}
	else
	{
		console.log("Couldn't fetch " + url + " (" + response.statusText + ")");
		process.exit(1);
	}
}

var uploadMedia = async function(b64data, T)
{
	var {data, resp} = await T.post('media/upload', { media_data: b64data });
	
	if (data.errors || !resp || resp.statusCode != 200)
	{ 
		throw new Error("Couldn't upload media");
	}
	return data.media_id_string;
}


 function render_media_tag(match, T)
 {
	 var unescapeOpenBracket = /\\{/g;
	 var unescapeCloseBracket = /\\}/g;
	 match = match.replace(unescapeOpenBracket, "{");
	 match = match.replace(unescapeCloseBracket, "}");
 
	 if (match.indexOf("svg ") === 1)
	 {
		 return generate_svg(match.substr(5,match.length - 6), T);
	 }
	 else if (match.indexOf("img ") === 1)
	 {
		 return fetch_img(match.substr(5, match.length - 6), T);
	 }
	 else
	 {
		 throw(new Error("error {" + match.substr(1,4) + "... not recognized"));
	 }
 }

// this is much more complex than i thought it would be
// but this function will find our image tags 
// full credit to BooDooPerson - https://twitter.com/BooDooPerson/status/683450163608817664
// Reverse the string, check with our fucked up regex, return null or reverse matches back
var matchBrackets = function(text) {
  
  // simple utility function
  function reverseString(s) {
    return s.split('').reverse().join('');
  }

  // this is an inverstion of the natural order for this RegEx:
  var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

  text = reverseString(text);
  var matches = text.match(bracketsRe);
  if(matches === null) {
    return null;
  }
  else {
    return matches.map(reverseString).reverse();
  }
}


//see matchBrackets for why this is like this
function removeBrackets (text) {
  
  // simple utility function
  var reverseString = function(s) {
    return s.split('').reverse().join('');
  }

  // this is an inverstion of the natural order for this RegEx:
  var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

  text = reverseString(text);
  return reverseString(text.replace(bracketsRe, ""));
}


 var recurse_retry = async function(tries_remaining, tweet, T)
{
	if (tries_remaining <= 0)
	{
		console.log("Out of retries, giving up");
		process.exit(1);
	}
	else
	{
		try
		{
			console.log(tweet);

			var tweet_without_image = removeBrackets(tweet);

			params = { status: tweet_without_image};

			var media_tags = matchBrackets(tweet);

			if (media_tags)
			{
				try 
				{
					var media_promises = media_tags.map(tag => render_media_tag(tag, T));
					var medias = await Promise.all(media_promises);
					params.media_ids = medias;
				}
				catch (err)
				{
					if (err['code'] == 89)  
				  		{
				  			console.log("Account permissions are invalid");
					  		process.exit(1);
				  		}
				  		else if (err['code'] == 226)  
				  		{
				  			console.log("Account has been flagged as a bot");
					  		process.exit(1);
				  		}
				  		else if (err['statusCode'] == 404)
				  		{

				  			console.log("Unknown (statusCode 404) error");
					  		process.exit(1);
				  			//unknown error
				  		}
				  		else
				  		{
							console.log("error with media tags");
							console.log(err);
							process.exit(1);
				  		}
				}
				
			}
			
			T.post('statuses/update', params, function(err, data, response) {
				if (err)
				{
					if (err["code"] == 186)
					{
						console.log("Tweet over 140 characters");
						process.exit(1);
					}
					else if (err['code'] == 187)
					{
						console.log("Tweet a duplicate");
						process.exit(1);
					}

					else if (err['code'] == 89)  
					{
						console.log("Account permissions are invalid");
						process.exit(1);
					}
					else if (err['code'] == 226)  
					{
						console.log("Account has been flagged as a bot");
						process.exit(1);
					}
					else if (err['statusCode'] == 404)
					{

						console.log("Unknown (statusCode 404) error");
						process.exit(1);
						//unknown error
					}
					else
					{
						console.error("twitter returned error " + err['code'] + " " + JSON.stringify(err, null, 2));  
						console.log("twitter returned error " + err['code'] + " : " + err['message']);  
						
						process.exit(1);
					}
					
					
				}

			});

		}
		catch (e)
		{
			if (tries_remaining <= 4)
			{
				console.log("error generating tweet (retrying)\nerror: " + e.stack);
			}
			await recurse_retry(tries_remaining - 1, processedGrammar, T);
		}
		
	}
	
};


send_tweet(fs.readFileSync('/dev/stdin').toString());

