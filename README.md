# anotherway
加密翻墙代理

#####拓扑结构:

角色:

角色1 | 角色2 | 角色3
------|-------|------
浏览器|内部http代理|外部代理



|        浏览器 ==>|内部http(s)代理 ==>| 外部代理==>|目标网站 |
|---------------|----------------|---------|---------|
|设置代理为pac脚本方式|将角色3上的password<br>复制到proxy_agent.js <br>相同路径下<br>根据需要修改pac.js文件<br>启动:<br>./daemon node `pwd`/proxy_agent.js| 生成password文件，<br>内容为文本数据，<br>做为加密的密码文件.<br>复制一份password文件到角色2<br>启动: <br>./daemon node `pwd`/proxy_server.js |

#####

