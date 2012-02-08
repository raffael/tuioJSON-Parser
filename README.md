## tuioJSON

This library contains functionality to parse tuioJSON Protocol based messages.

tuioJSON Protocol is a specification for JSON based message communication to stream TUIO Event data to clients. That is, using modern web technologies like WebSockets, an existing TUIO server can be enhanced with WebSocket server functionality to stream any kind of TUIO events to HTML clients that implement the tuioJSON protocol. For a full documentation of the tuioJSON Protocol, visit [the tuioJSON github project](https://github.com/raffael-me/tuioJSON-Protocol).

# Usage

1. Embed the tuioJSONParser.js in your HTML5 based application.
2. Create an tuioJSONParser object:
	var parser	= new tuioJSONParser();
3. Feed the parser with JSON objects:
	parser.parse(messageObject);
4. That's it, your app will receive valid Touch events.

# Enhanced Example
Since this library only contains functionality to *parse* JSON objects, we should also take a look at a more advanced example, that handles WebSocket communication with a TUIO based server.

	// create the Parser object
	var parser	= new tuioJSONParser({
		verboseMode: true
	});
	
	// initialize a WebSocket Object to connect to your TUIO server
	socket = new WebSocket('ws://127.0.0.1:8787/tuioServer/socket');
	
	// define Callback handler for onOpen event
	socket.onopen = function(){
		// (if implemented, do some socket authentication and registering operations here)
	}
	
	// define Callback handler for onMessage event
	socket.onmessage = function(msg){
		// extract JSON data from message
		var data = JSON.parse(msg.data);
		// and pass it to the TuioJSON parser
		parser.parse(data);
	}

## API description

The parser only needs a few options. You can pass an options object to the parser while creating it:

	options = {
		/* if set to true, critical errors will throw an exception */
		throwErrors: true,
		/* if set to true, the script will output a lot of information to the console */
		verboseMode: false,
		/* if set to true, the percental Tuio coordinates will be translated relative to the browser's position and dimension */
		browserRelativeCoordinates: false,
		/* if set to true, a touchstart-touchend sequence (no touchmoves) will trigger Mouse Move, Down, Up, Click Event */
		triggerMouseClick: true,
		/* specifies the timeout time [ms] for touchend triggering if fixTWRemoval is active */
		reanimationTimeOut: 100,
		/* if set to true, the script will try to fix the misbehavior of the T&W Server */
		fixTWRemoval: true
	}

	var parser	= new tuioJSONParser(options);
	
## T&W Fixor

The Touch&Write Server automatically sends remove-start sequences while dragging with the fingers for a longer period of time.
In order to fix that and to receive continuous dragging paths, the *TWFixor.js* has been written to pipe & filter the tuioJSON messages to the actual tuioJSON Parser.