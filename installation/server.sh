#!/usr/bin/env bash

sudo yum install vim -y
sudo hostnamectl set-hostname ipa.example.com
sudo vim /etc/hosts (add line `192.168.33.10 (curret ip address) ipa.example.com ipa`)
sudo setenforce 0
sudo sed -i 's/^SELINUX=.*/SELINUX=permissive/g' /etc/selinux/config
sudo yum -y install @idm:DL1
sudo yum -y install freeipa-server
sudo yum install -y ipa-server-dns bind-dyndb-ldap
sudo ipa-server-install
sudo systemctl enable --now firewalld
sudo firewall-cmd --add-service={http,https,dns,ntp,freeipa-ldap,freeipa-ldaps} --permanent
sudo firewall-cmd --reload
sudo kinit admin
sudo ipa config-mod --defaultshell=/bin/bash
sudo ipa user-add alice --first=alice --last=alice --email=alice@gmail.com --password
# sudo ssh alice@192.168.33.10 # check ssh login on host machine

sudo yum install -y cockpit
sudo systemctl enable --now cockpit.socket
sudo firewall-cmd --permanent --zone=public --add-service=cockpit
sudo firewall-cmd --reload
sudo printf '[WebService]\nClientCertAuthentication = true\n\n[Basic]\naction = none\n' > /etc/cockpit/cockpit.conf

cd
mkdir -p aliceCertificates
printf '[req]\ndistinguished_name=dn\nextensions=v3_req\n[dn]\n[v3_req]\nkeyUsage=digitalSignature,keyEncipherment,keyAgreement\n' > /tmp/openssl.cnf
openssl req -x509 -newkey rsa:2048 -days 365 -nodes -keyout alice.key -out alice.pem -subj "/CN=alice" -config /tmp/openssl.cnf -extensions v3_req
openssl pkcs12 -export -password pass:somepassword -in alice.pem -inkey alice.key -out alice.p12
sudo ipa user-add-cert alice --certificate="$(grep -v ^---- alice.pem)"
# add certificate to browser and login
