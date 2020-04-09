#include <SPI.h>
#include <WiFiNINA.h>


int status = WL_IDLE_STATUS;     // the Wifi radio's status

void connect_wifi(char * ssid, char * pwd) {
  // check for the WiFi module:
  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("ERROR : Communication with WiFi module failed!");
    // don't continue
    while (true);
  }

  String fv = WiFi.firmwareVersion();
  if (fv < WIFI_FIRMWARE_LATEST_VERSION) {
    Serial.println("Please upgrade the firmware");
  }
  // attempt to connect to Wifi network:
  // faire plutot un do .. while ? 
  while (status != WL_CONNECTED) {
    Serial.print("Attempting to connect to WPA SSID: ");
    Serial.println(ssid);
    // Connect to WPA/WPA2 network:
    status = WiFi.begin(ssid, pwd);
    Serial.println("WiFi code status :");
    Serial.println(status);
    Serial.println("Waiting 10 secondes ......");
    // wait 10 seconds for connection:
    delay(10000);
  }
  // you're connected now
  Serial.println("You're connected to the network");
}