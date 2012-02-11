var scriptTuioParser	= document.createElement('script');
scriptTuioParser.src	='http://raffael.local/bachelor/tuioJSON Parser/lib/tuioJSONParser.js';
scriptTuioParser.type	='text/javascript';
scriptTuioParser.async	= true;
scriptTuioParser.onload	= function(){
	
}
document.head.appendChild(scriptTuioParser);


var parser	= new tuioJSONParser({
	logAll: false
});

setTimeout(function(){
		// initialize a WebSocket Object
		socket = new WebSocket('ws://127.0.0.1:8787/jWebSocket/jWebSocket');
		
		// define Callback handler for opOpen event
		socket.onopen = function(){
			socket.send('{"ns":"de.dfki.touchandwrite.streaming","type":"register","stream":"touchandwriteevents","utid":3}');
		}
		
		// define Callback handler for onMessage event
		socket.onmessage = function(msg){
			console.log("tuioJSON is ready");
			// extract JSON data from message
			var data = JSON.parse(msg.data);
			// post Timestamp
			if (window.location.hash.indexOf('logtimestamp')!=-1) console.log("receive@"+new Date());
			// and pass it to the TuioJSON parser
			parser.parse(data);
		}
		
}, 2000);