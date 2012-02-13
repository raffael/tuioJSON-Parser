/**
 * by Raffael Hannemann (http://www.raffael.me)
 * 
 * You can use the Bookmarklet to enable Touch responsiveness using an item of your bookmarks bar.
 *
 */

/**
 * state variables
 */
var tuioParserComplete	= false,
	twFixorComplete		= false;


/**
 * as soon as both scripts have been loaded, create the parser and the WebSocket connection
 */
function injectingTuioComplete(){
	if (tuioParserComplete && twFixorComplete) {
		window.parserProxy	= new TWFixor({
			tuioJSONParser:	new tuioJSONParser({
				// parsing options
			})
		});
		
		// initialize a WebSocket Object
		socket = new WebSocket('ws://127.0.0.1:8787/jWebSocket/jWebSocket');
		
		// define Callback handler for opOpen event
		socket.onopen = function(){
			var registerMessage = '{"ns":"de.dfki.touchandwrite.streaming","type":"register","stream":"touchandwriteevents"}';
			socket.send(registerMessage);
			console.log("tuioJSON is ready");
			var event	= document.createEvent('CustomEvent');
			event.initCustomEvent('tuiojsonready', true, true, 1);
			document.dispatchEvent(event);
		}
		
		// define Callback handler for onMessage event
		socket.onmessage = function(msg){
			// extract JSON data from message
			var data = JSON.parse(msg.data);
			// and pass it to the TuioJSON parser
			window.parserProxy.fix(data);
		}
	}
}

/**
 * prepare script injecting and define onload event handlers
 */
var scriptTuioParser	= document.createElement('script');
scriptTuioParser.src	='http://raffael.local/bachelor/tuioJSON Parser/lib/tuioJSONParser.js';
scriptTuioParser.type	='text/javascript';
scriptTuioParser.async	= true;
scriptTuioParser.onload	= function(){
	tuioParserComplete	= true;
	injectingTuioComplete();
}

var scriptTWFixor		= document.createElement('script');
scriptTWFixor.src		='http://raffael.local/bachelor/tuioJSON Parser/TWFixor.js';
scriptTWFixor.type		='text/javascript';
scriptTWFixor.async		= true;
scriptTWFixor.onload	= function(){
	twFixorComplete		= true;
	injectingTuioComplete();
}

/**
 * append the two scripts
 */
document.head.appendChild(scriptTuioParser);
document.head.appendChild(scriptTWFixor);
