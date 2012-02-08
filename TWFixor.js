function TWFixor(options) {

	options = extend({
		/* if set to true, critical errors will throw an exception */
		throwErrors: true,
		/* if set to true, the script will output a lot of information to the console */
		verboseMode: false,
		reanimationTimeOut: 20,
		tuioJSONParser: null
	},options);
	
	if (options.tuioJSONParser==null) throw "No tuioJSONParser object found";
	
	var tuioJSONParser	= options.tuioJSONParser;
	
	/**
	 * lastStateForId
	 * stores the last message state ('started', 'move', 'remove') for the identifiers, which is
	 * necessary for fixing the T&W misbehavior
	 */
	var lastStateForId	= {};
	
	/**
	 * identifierTimeOuts
	 * stores setTimeout objects that are necessary to delete Touches to handle the T&W misbehavior
	 */
	var identifierTimeOuts = {};
	
	
	function fixTouchMessage(message) {
		switch (message.state) {
			case 'started':
				if (lastStateForId[message.id] && lastStateForId[message.id]=='remove') {
					// clear any killer timeout:
					if (identifierTimeOuts[message.id]) clearTimeout(identifierTimeOuts[message.id]);
				} else {
					tuioJSONParser.parse(message);
				}
				break;
			case 'move':
				tuioJSONParser.parse(message);
				break;
			case 'remove':
				// trigger the event later
				(function(message){
					identifierTimeOuts[message.id] = setTimeout(function(){
						tuioJSONParser.parse(message);
					}, options.reanimationTimeOut);
				})(message);
				//Touches[message.id].$markedForRemoval = true;
				
				break;
		}
		lastStateForId[message.id]	= message.state;
	}
	
	this.fix = function(msg) {
	
		switch(msg.type) {
			case 'touch':
				fixTouchMessage(msg);
				break;
			default:
				tuioJSONParser.parse(msg);
		}
	}
	
	function extend(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=false;if(typeof g==="boolean"){j=g;g=arguments[1]||{};h=2}if(typeof g!=="object"&&!jQuery.isFunction(g)){g={}}if(i===h){g=this;--h}for(;h<i;h++){if((a=arguments[h])!=null){for(b in a){c=g[b];d=a[b];if(g===d){continue}if(j&&d&&(jQuery.isPlainObject(d)||(e=jQuery.isArray(d)))){if(e){e=false;f=c&&jQuery.isArray(c)?c:[]}else{f=c&&jQuery.isPlainObject(c)?c:{}}g[b]=jQuery.inject(j,f,d)}else if(d!==undefined){g[b]=d}}}}return g}
	
}