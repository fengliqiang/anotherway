# anotherway
加密翻墙代理

介绍:
这是一个http(s)代理服务程序。为了绕过gfw的封锁,将代理服务器拆分成两部分:

1,内部代理，部署在本机或者局域网内.

2,外部服务器，部署在墙外。

内部代理接受内部的http请求，通过对称加密链路将请求转发到外部节点，完成http(s)请求。

内部代理提供了一个pac访问接口,pac脚本根据使用者指定的访问列表，来决定目标网站请求是否要走代理;pac同时提供了一个广告过滤列表，对于列表中的网站，将其指向一个本地不存在的代理，达到广告过滤的目的。


#####拓扑结构:

角色:

角色1 | 角色2 | 角色3
------|-------|------
浏览器|内部http代理|外部代理


设置:

|        浏览器 ==>|内部http(s)代理 ==>| 外部代理==>|目标网站 |
|---------------|----------------|---------|---------|
|设置代理为pac脚本方式|将角色3上的password<br>复制到proxy_agent.js <br>相同路径下<br>根据需要修改pac.js文件<br>启动:<br>./daemon node `pwd`/proxy_agent.js| 生成password文件，<br>内容为文本数据，<br>做为加密的密码文件.<br>复制一份password文件到角色2<br>启动: <br>./daemon node `pwd`/proxy_server.js |

#####

部署步骤:

   1. 墙外申请代理服务器,安装nodejs.<br>
   2. 准备一个password文件,内容尽量为随机字符,复制到内部http代理服务器和外部代理服务器各一份<br>
   3. 登陆外部代理服务器: mkdir node_modules && npm install anotherway && cp password node_modules/anotherway/ && ./daemon \`pwd\`/node_modules/anotherway/proxy_server.js<br>
   
   4. 登陆内部代理服务器: 
     + 4-1 mkdir node_modules && npm install anotherway && cp password node_modules/anotherway/
     + 4-2 修改proxy_agent.js中第11行的ip地址为外部代理服务器的ip
     + 4-3 ./daemon \`pwd\`/node_modules/anotherway/proxy_agent.js
     
   5. 修改浏览器：
      + firefox ：首选项=>高级=>网络=>设置=>自动代理配置: 如果内部代理部署在本机，则设置为http://127.0.0.1:8090/pac.js ,否则，将127.0.0.1该为内部代理服务器的ip地址。
      + ie, chrome: internet选项=>连接=>局域网设置=>选中使用自动配置脚本:地址同上设置。

注: daemon是后台加载程序，是为脱离shell而写的守护进程,windows用户不要使用，直接用node启动即可。
