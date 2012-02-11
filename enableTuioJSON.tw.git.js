var script=document.createElement('script');script.src='https://raw.github.com/raffael-me/tuioJSON-Parser/master/TWFixor.js';script.type='text/javascript';
document.head.appendChild(script);

var script2=document.createElement('script');script2.src='https://raw.github.com/raffael-me/tuioJSON-Parser/master/lib/tuioJSONParser.js';script2.type='text/javascript';
document.head.appendChild(script2);

var parser	= new tuioJSONParser({
});
var fixor	= new TWFixor({
	tuioJSONParser:	parser
});

setTimeout(function(){


	// initialize a WebSocket Object
	socket = new WebSocket('ws://127.0.0.1:8787/jWebSocket/jWebSocket');
	
	// define Callback handler for opOpen event
	socket.onopen = function(){
		var registerMessage = '{"ns":"de.dfki.touchandwrite.streaming","type":"register","stream":"touchandwriteevents"}';
		socket.send(registerMessage);
		console.log("WebSocket connection established");
	}
	
	socket.onerror	= function(){
		throw "Something went wrong while connecting to WebSocket.";
	}
	
	// define Callback handler for onMessage event
	socket.onmessage = function(msg){
		// extract JSON data from message
		var data = JSON.parse(msg.data);
		// and pass it to the TuioJSON parser
		fixor.fix(data);
	}
}, 2000);