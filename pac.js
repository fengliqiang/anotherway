var proxy_list = ['google.com','www.google.com', 'mail.google.com', 'gmail.com', 'google.com.hk','www.google.com.hk', 'googlevideo.com','facebook.com', 'www.facebook.com',
    'twitter.com', 'www.twitter.com', 'www.youtube.com', 'youtube.com', 'ytimg.com', 'ggpht.com', '2mdn.net', 'wikipedia.org','gstatic.com','googleusercontent.com',
    'googleapis.com', 'akamaihd.net','youtube-nocookie.com', 'nodejs.org', 'icu.project.org', 'simplesystems.org', 'bbc.com','static.xx.fbcdn.net','npmjs.com'];
var ad_list = ['cb.baidu.com', 'cbjs.baidu.com', 'cnzz.com', 'cnzz.net'];
var agent = '127.0.0.1:8008';
function FindProxyForURL(url, host) {
    host = host.split(':')[0];
    if ( url.match(/^http/i) ) {
        for ( var i = 0; i < ad_list.length; i++ ) {
            if ( host.indexOf(ad_list[i]) >= 0 ) return 'PROXY 127.0.0.1:9008';
        }
        for ( var i = 0; i < proxy_list.length; i++ ) {
            if ( host.indexOf(proxy_list[i]) >= 0 ) return 'PROXY ' + agent;
        }
    }
    return 'DIRECT;PROXY ' + agent;
}
