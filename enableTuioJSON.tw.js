var script=document.createElement('script');script.src='http://localhost/bachelor/tuioJSON Parser/TWFixor.js';script.type='text/javascript';
document.head.appendChild(script);

var script2=document.createElement('script');script2.src='http://localhost/bachelor/tuioJSON Parser/lib/tuioJSONParser.js';script2.type='text/javascript';
document.head.appendChild(script2);

setTimeout(function(){
	var parser	= new tuioJSONParser({
	});
	var fixor	= new TWFixor({
		tuioJSONParser:	parser
	});

	// initialize a WebSocket Object
	socket = new WebSocket('ws://127.0.0.1:8787/jWebSocket/jWebSocket');
	
	// define Callback handler for opOpen event
	socket.onopen = function(){
		var registerMessage = '{"ns":"de.dfki.touchandwrite.streaming","type":"register","stream":"touchandwriteevents"}';
		socket.send(registerMessage);
	}
	
	// define Callback handler for onMessage event
	socket.onmessage = function(msg){
		// extract JSON data from message
		var data = JSON.parse(msg.data);
		// and pass it to the TuioJSON parser
		fixor.fix(data);
	}
}, 2000);