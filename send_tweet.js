//call like node send_tweet.js CONSUMER_KEY CONSUMER_SECRET | TWEET



var fs = require('fs');

var _ = require('underscore');

var Twit = require('twit');

var svg2png = require('svg2png');
var async = require('async');
var fs = require('fs');

_.mixin({
	guid : function(){
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
	    return v.toString(16);
	  });
	}
});


var send_tweet = function(tweet)
{

	var T = new Twit(
	{
	    consumer_key:         process.env.TWITTER_CONSUMER_KEY
	  , consumer_secret:      process.env.TWITTER_CONSUMER_SECRET
	  , access_token:         process.env.ACCESS_TOKEN
	  , access_token_secret:  process.env.ACCESS_TOKEN_SECRET
	}
	);

	recurse_retry(5, tweet, T);

}

var generate_svg = function(svg_text, T, cb)
{
	
		svg2png(new Buffer(svg_text))
		.then(data => uploadMedia(data.toString('base64'), T, cb))
		.catch(e => cb(e));

}

var fetch_img = function(url, T, cb)
{
	//todo all this
}

var uploadMedia = function(b64data, T, cb)
{
	T.post('media/upload', { media_data: b64data }, function (err, data, response) {
		if (err)
		{
			cb(err);
		}
		else
		{
			cb(null, data.media_id_string);
		}
	});
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


 var recurse_retry = function(tries_remaining, tweet, T)
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
			//console.log(tweet);
			var tweet_without_image = removeBrackets(tweet);
			var media_tags = matchBrackets(tweet);
			if (media_tags)
			{
				async.parallel(media_tags.map(function(match){
					if (match.indexOf("svg ") === 1)
					{
						return _.partial(generate_svg, match.substr(5,match.length - 6), T);
					}
					else if (match.indexOf("img ") === 1)
					{
						return _.partial(fetch_img, match.substr(5), T);
					}
					else
					{
						return function(cb){
							cb("error {" + match.substr(1,4) + "... not recognized");
						}
					}
				}),
				function(err, results)
				{
					if (err)
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
				  			
							console.log("error generating SVG");
							console.log(err);
							recurse_retry(tries_remaining - 1, processedGrammar, T);
							return;
				  		}

					}

		  			var params = { status: tweet_without_image, media_ids: results };
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
				});

			}
			else
			{
				T.post('statuses/update', { status: tweet }, function(err, data, response) {
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
				  			console.error("twitter returned error " + err['code'] + JSON.stringify(err, null, 2));  
					  		console.log("twitter returned error " + err['code'] + " : " + err['message']);  
				  			
						  	process.exit(1);
				  		}
					  	
					 
					}

				});
			}
		
			
		}
		catch (e)
		{
			if (tries_remaining <= 4)
			{
				console.log("error generating tweet (retrying)\nerror: " + e.stack);
			}
			recurse_retry(tries_remaining - 1, processedGrammar, T);
		}
		
	}
	
};


send_tweet(fs.readFileSync('/dev/stdin').toString());

