# anotherway
加密翻墙代理

#h5拓扑结构:
<br>#h5        角色1                   角色2                                         角色3
<br>#h5--------浏览器================> 内部http(s)代理 ============================> 外部代理==================>目标网站
<br>#h5配置:                         |                                         |
<br>#h5                              | 将角色3上的password复制到               | 生成password文件，内容为文本数据，做为加密的密码文件
<br>#h5  浏览器端设置pac脚本网络地址 | proxy_agent.js 相同路径下               | 复制一份password文件到角色2
<br>#h5                              | 根据需要修改pac.js文件                  | 启动: ./daemon node `pwd`/proxy_server.js 
<br>#h5                              | 启动: ./daemon node `pwd`/proxy_agent.js| 


