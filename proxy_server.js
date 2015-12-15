var   http         = require('http')
    , path         = require('path')
    , fs           = require('fs')
    , net          = require('net')
    , crypto       = require('crypto');
var password;
fs.readFile(path.join(__dirname, 'password'), function on_read(error, data){
    if ( error ) {
        console.log("read file error");
        process.exit(0);
    }
    password = data.toString();
});
function raw_name(name) {
    var sp = true;
    return name.replace(/[a-zA-Z\-]/g, function(c){
        if ( c == '-' ) { sp = true; return c; }
        if ( sp ) { sp = false; return c.toUpperCase(); }
        return c;
    });
}
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
function Encoder() {}
Encoder.prototype.append = function(data) { this.cache = this.cache?Buffer.concat([this.cache, data]):data; };
Encoder.prototype.read = function() {
    if ( ! this.cache || ! this.cache.length ) return null;
    var range_len = 65435 - 4;
    var size = Math.min(this.cache.length, range_len);
    var ret =  encode('data', this.cache.slice(0, size));
    this.cache = this.cache.slice(size);
    if ( this.cache.length == 0 ) this.cache = null;
    return ret;
};
function Decoder() {}
Decoder.prototype.append = function (data){ this.cache = this.cache?Buffer.concat([this.cache, data]):data; };
Decoder.prototype.read = function() {
    if ( ! this.cache ) return null;
    if ( this.cache.length < 4 ) return null;
    var pack_len = this.cache.readInt32LE(0);
    if ( pack_len > 65535 + 100 || pack_len < 0 ) {
        this.error = true;
        return null;
    }
    if ( this.cache.length < pack_len + 4 ) return null;
    var dcipher = crypto.createDecipher('aes256', password);
    var part1 = dcipher.update(this.cache.slice(4, pack_len + 4));
    var upack_data = Buffer.concat([part1, dcipher.final()]);
    this.cache = this.cache.slice(pack_len + 4);
    if ( this.cache.length == 0 ) this.cache = null;
    if ( upack_data.length < 4 ) {
        this.error = true;
        return null;
    }
    return { protocol : upack_data.slice(0, 4).toString(), data : upack_data.slice(4) };
};
Decoder.prototype.shift = function () {
    var ret = null;
    if ( this.cache && this.cache.length ) {
        ret = this.cache;
        this.cache = null;
    }
    return ret;
};
function Connection() {
}
Connection.prototype.start = function(head) {
    if ( ! head.host ) return false;
    if ( this.head ) {
        if ( ! this.next ) this.next = new Connection();
        if ( this.client ) console.log('pipe line');
        return this.next.start(head);
    }
    this.head = head;
    var addr = head.host.split(':');
    if ( ! addr || addr.length == 0 ) return false;
    var port = (addr.length > 1)?addr[1]:(head.ssl?443:80);

    this.host = addr[0];
    this.port = port;
    this.binary = (! this.head.header ) || this.head.header.length == 0;
    this.connected = false;
    this.next = null;
    this.state = 0;
    this.up_sock = new net.Socket();
    this.up_sock.on('close', this.close.bind(this));
    this.up_sock.on('error', (function (err){
        if ( this.state < 2 ) return this.on_connect(err);
        this.close();
    }).bind(this));
    this.up_sock.on('data', this.on_res.bind(this));
    console.log('connect to ' + this.host + ':' + port);
    this.up_sock.connect(port, this.host, this.on_connect.bind(this));

    var params = parse_head(this.head.header.slice(0, this.head.header.length - 4));
    this.method = params.protocol;
    if ( this.method == 'POST' ) {
        console.log('--------------\n' + this.head.header);
    }
    var length = params.head['Content-Length'];
    length = length?parseInt(length):0;
    if ( ! length && params.protocol !== 'POST' ) length = 0;
    this.up_count = {
        size : length,
        up : 0,
        left : function() { return this.size - this.up; }
    };
    return true;
};
Connection.prototype.on_res = function (data) {
    this.res = this.res?Buffer.concat([this.res,data]):data;
    this.updown();
};
function parse_head(head){
    var result = {};
    var args = head.split('\r\n');
    var answer = args[0].split(' ');

    for ( var i = 1; i < args.length; i++ ) {
        var index = args[i].indexOf(': ');
        if ( index > 0 ) {
            result[args[i].slice(0, index)] = args[i].slice(index + 2);
        }
    }
    return {protocol:answer[0], code : parseInt(answer[1]), head :result};
}
Connection.prototype.updown = function() {
    if ( this.state < 1 ) return;
    if ( this.req && this.req.length > 0 && this.up_sock ) {
        this.up_sock.write(this.req);
        if ( ! this.binary ) this.up_count.up += this.req.length;
        this.req = null;
    }
    if ( this.client && this.res && this.res.length > 0 ) {//
        if ( this.binary ) {
            this.client.write(this.res);
            this.res = null;
        }
        else {
            if (this.state == 1 ) {//parse response head
                var head = this.res.toString();
                if ( ! head.match(/\r\n\r\n/) ) return;
                var pos = head.indexOf('\r\n\r\n');
                var head = head.slice(0, pos);
                var res_header = parse_head(head.slice(0, pos));
//                if ( this.method == 'POST') {
                    console.log(this.head.host + ' res :');
                    console.log(head);
//                }
                this.client.write(this.res.slice(0, pos + 4));
                this.res = this.res.slice(pos + 4);
                var size = res_header.head['Content-Length'];
                if ( typeof size == 'undefined' && (res_header.code / 100 != 2 || res_header.code == 204 || res_header.code == 205 ) ) {
                    size = '0';
                }
                if ( res_header.head['Transfer-Encoding'] === 'chunked' ) {
                    this.chunked = true;
                }
                else if ( typeof size != 'undefined' ) {
                    this.down_count = {
                        size : parseInt(size),
                        down : 0,
                        left : function () { return this.size - this.down; }
                    }
                }
                else this.by_close = true;
                this.state = 2;
            }
            if ( this.state == 2 ) {//data handler
                if ( this.res && this.res.length > 0 ) {
                    if ( this.down_count ) {
                        var write_size = Math.min(this.res.length, this.down_count.left());
                        this.client.write(this.res.slice(0, write_size));
                        this.res = this.res.slice(write_size);
                        this.down_count.down += write_size;
                        if ( this.res.length == 0 ) this.res = null;
                    }
                    else if ( this.chunked ) {
                        while ( 1 ) {
                            var chunkhead = this.res.slice(0, Math.min(this.res.length, 10)).toString();
                            var pos = chunkhead.indexOf('\r\n');
                            if ( pos < 0 ) {
                                if ( this.res.length >= 10 ) { this.error = 'chunk error'; this.close(); return; }
                                break;
                            }
                            var chunk_size = parseInt(chunkhead.slice(0, pos), 16) + 4 + pos;
                            if ( this.res.length < chunk_size ) return;
                            this.client.write(this.res.slice(0, chunk_size));
                            this.res = this.res.slice(chunk_size);
                            if ( chunk_size == 5 ) {
                                this.state = 3; break;
                            }
                        }
                    }
                    else {
                        if ( this.res.length ) this.client.write(this.res);
                        this.res = null;
                    }
                }
                if ( this.down_count ) {
                    if ( this.down_count.left() == 0 ) this.state = 3;
                }
            }
            if ( this.state == 3 ) {//data recv done
                console.log(this.head.host + ' poped');
                return this.client.pop();
            }
        }
    }
};
Connection.prototype.write = function (data) {
    var ret;
    if ( this.binary ) {
        this.req = this.req?Buffer.concat([this.req, data]):data;
        ret = data.length;
    }
    else {
        if ( this.next ) return this.next.write(data);
        ret = Math.min(data.length, this.up_count.left());
        if ( ret > 0 ) {
            var append = data.slice(0, ret);
            this.req = this.req?Buffer.concat([this.req,append]):append;
        }
        if ( data.length > ret ) {
            this.error = 'Upload Size error';
            return -1;
        }
    }
    this.updown();
    return ret;
};
Connection.prototype.on_connect = function(err) {
    this.state = 1;
    if (err) {
        this.error = 'connect error';
        console.log(this.head.host + ' connect error');
        return this.on_res(new Buffer('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'));
    }
    if ( this.binary ) this.on_res(new Buffer('HTTP/1.0 200 Connection Established\r\nContent-Length: 0\r\n\r\n'));
    else {
        this.up_sock.write(this.head.header);
        this.updown();
    }
};
Connection.prototype.close = function () {
    if ( ! this.up_sock ) return;
    if ( this.by_close && ! this.error ) this.state = 3;
    else if ( this.state < 3 ) this.state = 4;
    this.up_sock.destroy();
    this.up_sock = null;
    if ( this.client ) this.client.pop();
    this.client = null;
};
Connection.prototype.destroy = function () {
    if ( this.next ) this.next.destroy();
    this.next = null;
    this.close();
};
var ssl_server = net.createServer(function(sock){

    function close() { return session && session.close(); }
    var session = {
        protocol_error : false,
        decoder : new Decoder(),
        encoder : new Encoder(),
        socket : sock,
        on_res : function(data) {
            this.encoder.append(data);
            for ( var pack; pack = this.encoder.read() ; this.socket.write(pack) ) {
                if ( this.connection.method == 'POST' ) console.log('res ' + data.length);
            }
        },
        on_data : function() {
            var pack;
            while ( pack = this.decoder.read() ) {
                if ( pack.protocol === 'data' ) {
                    if ( ! this.connection ) return this.close();
                    this.connection.write(pack.data);
                }
                else {
                    if ( ! this.connect(pack) ) return this.close();
                }
            }
            if ( this.protocol_error ) return this.close();
        },
        connect : function (pack) {
            var head;
            try { head = JSON.parse(pack.data.toString()); }catch(e){ return this.close(); }
            if ( ! this.connection ) this.connection = new Connection();
            if ( ! this.connection.start(head) ) return false;
            var session = this;
            this.connection.client = {
                write : function (data) { return session.on_res(data); },
                destroy: function(){session.close();},
                pop : function(){
                    var conn = session.connection;
                    if ( ! conn ) {
                        return;
                    }
                    session.connection = conn.next;
                    if ( conn.next ) {
                        conn.next.client = conn.client;
                    }
                    conn.next = null;
                    if ( conn.by_close ) {
                        process.nextTick(close);
                    }
                    conn.destroy();
                    if ( session.connection ) session.connection.updown();
                }
            };
            return true;
        },
        proxy  : function(data) { this.decoder.append(data); this.on_data(); },
        close : function() {
            if ( this.connection ) this.connection.destroy();
            if ( this.socket ) this.socket.destroy();
            this.connection = this.socket = null;
            session = null;
        }
    };
    session.socket.on('data', function(data) {  session.proxy(data);  });
    session.socket.on('close', close);
    session.socket.on('error', close);
});
ssl_server.listen(8010, '0.0.0.0');
console.log('Server running at port 8010');

