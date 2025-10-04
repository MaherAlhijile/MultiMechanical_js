# **Multi-Mechanical**

## a Remote Device Orchestration System



### **Components**

#### Device Agents(Python scripts)

1. Runs on each mechanical system.
2. Connect to the central server via WebSocket (or TCP tunnel).
3. Authenticate and register with metadata
4. Stream camera feed and send computed data through server tunnel.



**metadata components:**

* type (to load correct UI on client)
* IP, port (internal, not exposed to client)
* Subnet assignment
* Public/Private flag
5432
Thesupremeofficer@

#### Central Server (Broker):

Connection bridge between clients and agents



**Responsibilities:**

1. Maintain persistent connections with devices.
2. Generate a connection token for each device session.
3. Handle authentication \& subnet-based access control.
4. Relay data streams between devices and clients.
5. Enforce rule: Client can only see devices in their subnet.
6. Enforce rule: Public devices are accessible globally.



#### Clients (Desktop application):

Unified desktop interface.



**Responsibilities:**

1. Connect only to server (no direct IP).
2. Enter device’s connection code (or browse subnet devices).
3. Request UI based on type (e.g., different control panels).
4. Receive live data streams from server.
5. Send control commands through server to device.





#### **Subnet Partitioning**

In the server database/config, each device and client tagged with a subnet ID.

On connection request, server checks:



If client’s subnet ID == device’s subnet ID → allow.

Else if device is public → allow.

Else → deny.





#### **Tech Stack**

Node.js (NestJS / Express + Socket.io / ws)



WebSockets

WebRTC



PostgreSQL

Redis



JWT

TLS/SSL

OAuth2



Docker + Docker Compose



Prometheus + Grafana

ELK Stack



create a batch file that will do this:
1- cd dispatcher/src, take port value from .env (in dispatcher/src), try to node app.js, if port is used kill proccess using it then start
2- cd frontend then npm start
3- cd tests then device.py
