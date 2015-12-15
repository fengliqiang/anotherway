var   util         = require('util')
    , http         = require('http')
    , url          = require('url')
    , path         = require('path')
    , fs           = require('fs')
    , net          = require('net')
    , crypto       = require('crypto');


var server = {
        host : '100.100.100.100',
        port : 8010
    }
    , password;
fs.readFile(path.join(__dirname, 'password'), function on_read(error, data){
    if ( error ) {
        console.log("read file error");
        process.exit(0);
    }
    password = data.toString();
});

function encode(protocol, data){
    if ( protocol.length != 4 ) return null;
    var cipher = crypto.createCipher('aes256', password)
        , result = [new Buffer(4)]
        , pack
        , len = 0;
    if ( pack = cipher.update(new Buffer(protocol)) ) result.push(pack);
    if ( pack = cipher.update(data) ) result.push(pack);
    if ( pack = cipher.final() ) result.push(pack);
    for ( var i = 0; i < result.length; i++ ) len += result[i].length;
    result[0].writeUInt32LE(len - 4, 0);
    return Buffer.concat(result);
}

function parse_headline(headline) {
    var list = headline.split(' ');
    if ( list.length < 2 ) return null;
    var result = {method:list[0]};
    if ( list[1].indexOf('http') != 0 ) {
        result.ssl = 1;
        list[1] = 'http://' + list[1];
    }
    var parsed = url.parse(list[1], true);
    if  (! parsed ) return null;
    if ( ! parsed.host ) return null;
    list[1] = parsed.path || '';
    result.uri = list[1];
    result.req = list[0]; for ( var i = 1; i < list.length; i++ ) { result.req += ' ' + list[i]; }
    result.host = parsed.host;
    return result;
}
function RequestLen(method, args) {
    if ( method != 'POST' ) return 0;
    for ( var i = 1; i < args.length; i++ ) {
        var params = args[i].split(': ');
        if ( params && params.length > 1 && params[0] == 'Content-Length' ) {
            return parseInt(params[1]);
        }
    }
    return -1;
}
var ssl_server = net.createServer(function(sock){
    function close() { return session && session.close(); }
    var session = {
        inited : false,
        left_size :0,
        connected : false,
        decode : function() {
            if ( ! this.response ) return null;
            if ( this.response.length < 4 ) return null;
            var pack_len = this.response.readInt32LE(0);
            if ( pack_len > 65535 || pack_len < 0 ) {
                this.protocol_error = true;
                return null;
            }
            if ( this.response.length < pack_len + 4 ) return null;
            var dcipher = crypto.createDecipher('aes256', password);
            var part1 = dcipher.update(this.response.slice(4, pack_len + 4));
            var upack_data = Buffer.concat([part1, dcipher.final()]);
            this.response = this.response.slice(pack_len + 4);
            if ( this.response.length == 0 ) this.response = null;
            if ( upack_data.length < 4 ) {
                this.protocol_error = true;
                return null;
            }
            return { protocol : upack_data.slice(0, 4).toString(), data : upack_data.slice(4) };
        },
        on_data : function() {
            function Min(a,b, c) { return Math.min(Math.min(a, b), c); }
            if ( ! this.request ) return;
            if ( ! this.inited ) this.send_head();
            var range_len = 65435 - 4;
            while ( this.request && this.request.length > 0 ) {
                while ( this.send_head() );
                if ( this.protocol_error || ! this.connected || this.left_size == 0 ) break;
                var size = Math.min(this.request.length, range_len);
                if ( this.left_size > 0 ) size = Math.min(size, this.left_size);
                this.up_sock.write(encode('data', this.request.slice(0, size)));
                this.request = this.request.slice(size);
                if ( this.request.length == 0 ) this.request = null;
                if ( this.left_size > 0 ) this.left_size -= size;
            }
            if ( this.protocol_error ) return close();
        },
        send_head : function () {
            if ( ! this.connected ) return false;
            if ( this.left_size != 0 ) return false;
            var head = this.request.toString(), pos;
            if ( head.match(/\r\n\r\n/) ) {
                pos = head.indexOf('\r\n\r\n') + 4;
            }
            else {
                if ( head.length > 1024 * 10 ) this.protocol_error = true;
                return false;
            }
            head = this.request.slice(0, pos - 4).toString();
            this.request = this.request.slice(pos);
            var args = head.split('\r\n');
            if ( args.length < 1 ) {
                this.protocol_error = true; return false;
            }
            var proto = parse_headline(args[0]);
            if ( ! proto ) {
                this.protocol_error = true; return false;
            }
            this.left_size = RequestLen(proto.method, args);
            args[0] = proto.req;
            var new_header = '';
            if ( ! proto.ssl ) {
                for ( var i = 0; i < args.length; i++ ) {
                    new_header += args[i] + '\r\n';
                }
                new_header += '\r\n';
            }
            else this.left_size = -1;
            this.up_sock.write(encode('head', new Buffer(JSON.stringify({host:proto.host,header:new_header}))));
            this.inited = true;
            return true;
        },
        send  : function(data) {
            this.request = this.request ? Buffer.concat([this.request, data]): data;
            if ( this.connected ) return this.on_data();
            if ( this.up_sock ) return;
            this.up_sock = new net.Socket();
            this.up_sock.on('close', close);
            this.up_sock.on('error', close);
            this.up_sock.on('data', function(data){
                session.response = session.response?Buffer.concat([session.response, data]):data;
                var dataObj;
                while ( session && (dataObj = session.decode()) ) {
                    sock.write(dataObj.data);
                }
                if ( session && session.protocol_error ) return close();
            });
            this.up_sock.connect(server.port, server.host, function (err) {
                if (err) return close();
                session.connected = true;
                session.up_sock.setKeepAlive(true, 3000);
                return session.on_data();
            });
        },
        close : function() {
            if ( this.up_sock ) this.up_sock.destroy();
            if ( sock ) sock.destroy();
            this.up_sock = sock = null;
            session = null;
        }
    };
    sock.on('data', function(data) {  session.send(data);  });
    sock.on('close', close);
    sock.on('error', close);
});
var proxy_port = 8008;
ssl_server.listen(proxy_port, '0.0.0.0');
console.log('Server running at port ' + proxy_port);

var http = require('http');
var url = require('url');
var nativejs = '';
fs.readFile(path.join(__dirname, 'pac.js'), function on_read(error, data){
    if ( error ) {
        console.log("read file error");
        process.exit(0);
    }
    nativejs = data.toString();
});

http.createServer(function (req, res) {
    var parsed     = url.parse(req.url, true);
    if  (! parsed ) return;
    console.log(req.method + ':' + req.url);
    req.on('data', function (data){
        console.log('on data: ' + data);
    });
    req.on('end', function (){

        if ( req.method === 'OPTIONS' ) {
            var rhead = {
                'Content-Type': 'text/plain',
                'Access-control-Allow-Origin' : '*',
                'Access-Control-Allow-Methods' : 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers' : 'accept, content-type',
                'Access-Control-Max-Age' : '1728000',
                'Content-Length': '0'
            };
            if (req.headers['access-control-request-headers'] ) rhead['Access-Control-Request-Headers'] = req.headers['access-control-request-headers'];
            if (req.headers['access-control-request-method'] ) rhead['Access-Control-Request-Method'] = req.headers['access-control-request-method'];
            res.writeHead(200, rhead);

            return res.end();
        }

        if ( parsed.pathname.indexOf('/pac.js') == 0 ) {
            res.writeHead(200, {
                'Content-Type': 'text/plain'
                ,'Access-Control-Allow-Origin':'*'
                ,'Cache-Control': 'no-cache'
            });
            res.end(nativejs.replace('var agent = \'127.0.0.1:8008\';', 'var agent = \'' + req.headers.host.split(':')[0] + ':' + proxy_port + '\';'));
        }
        else {
            res.writeHead(404, {
                'Content-Type': 'text/plain'
                ,'Access-Control-Allow-Origin':'*'
            });
            res.end('hello word\n');

        }

    });

}).listen(8090, "0.0.0.0");
console.log('Server running at port 8090');
