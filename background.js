const baseUrl = "https://www.r10.net";

// endpointler
const getMainPageUrl = () => `${baseUrl}/`;
const getNotificationPageUrl = () => `${baseUrl}/profile.php?do=bildirimler`;
const getNotificationUrl = () => `${baseUrl}/ajax.php?do=bildirimlerx&t=1`;

// bildirim geldiginde ses calar
const playAlertSound = () => {
  const audio = new Audio(chrome.runtime.getURL("assets/sounds/iphone.mp3"));
  audio.play();
};

const isR10 = url => url.indexOf(getMainPageUrl()) === 0;

// localStorage islemleri
const getLocalStorageItem = key => localStorage.getItem(key);
const setLocalStorageItem = (key, value) => localStorage.setItem(key, value);

// eklenti icon ve sayisini gunceller
const updateIconBadge = count => {
  chrome.browserAction.setBadgeText({
    text: count !== "0"
      ? count
      : ""
  });
  chrome.browserAction.setBadgeBackgroundColor({color: "#B71C1C"});
};

// bildirim sayisini gunceller gerekirse ses calar
const updateNotificationCount = count => {
  const currentCount = getLocalStorageItem("notificationCount");
  const changed = currentCount !== count;
  setLocalStorageItem("notificationCount", count);

  updateIconBadge(count);

  if (count > "0" && changed) {
    playAlertSound();
  }
};

const requestHandler = (method, url, formData = null, callback) => {
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4 && callback) {
      callback(xhr);
    }
  };
  xhr.withCredentials = true;
  xhr.send(formData);
};

const checkR10TabAndExecute = async () => {
  return new Promise((resolve, reject) => {
    chrome.tabs.getAllInWindow(undefined, tabs => {
      const r10Tab = tabs.find(tab => isR10(tab.url));

      resolve(r10Tab);
    });
  });
};

// guncel bildirim sayisini alir
const getNotificationCount = async () => {
  // sekmeler arasinda r10 aciksa istek gonderme
  const r10Tab = await checkR10TabAndExecute();
  if (r10Tab) 
    return;
  
  const tokens = JSON.parse(getLocalStorageItem("tokens") || "{}");

  if (!tokens.securityToken) 
    return;
  
  const formData = new FormData();
  formData.append("securitytoken", tokens.securityToken);
  formData.append("do", "bildirimlerx");
  formData.append("detail", 1);

  requestHandler("POST", getNotificationUrl(), formData, xhr => {
    const responseXML = xhr.responseXML;
    const notificationCountElement = responseXML.getElementsByTagName("okunmamisBildirimSayi")[0];
    const notificationCount = notificationCountElement
      ? notificationCountElement.textContent
      : "0";

    updateNotificationCount(notificationCount);
  });
};

const extractTokens = pageSource => {
  const extract = regex => (pageSource.match(regex) || [])[1];
  return {
    securityToken: extract(/var SECURITYTOKEN = "([^"]+)"/),
    loggedInUser: extract(/var loggedinuser = "([^"]+)"/),
    serverTimestamp: parseInt(extract(/var serverTimestamp = (\d+)/), 10)
  };
};

// kaynak kodundaki tokenlari alir
const fetchAndStoreTokens = () => {
  requestHandler("GET", getMainPageUrl(), null, xhr => {
    const tokens = extractTokens(xhr.responseText);
    setLocalStorageItem("tokens", JSON.stringify(tokens));
  });
};

// eklenti ilk kuruldugunda yapilan islemler
const onInit = () => {
  console.log("onInit");
  ["notificationCount", "tokens"].forEach(key => localStorage.removeItem(key));

  fetchAndStoreTokens();

  chrome.alarms.create("refresh", {
    periodInMinutes: 1 / 12
  });
  chrome.alarms.create("getToken", {periodInMinutes: 1});
};

const onAlarm = alarm => {
  if (alarm.name === "refresh") {
    getNotificationCount();
  } else if (alarm.name === "getToken") {
    fetchAndStoreTokens();
  }
};

// eklenti iconuna tiklandiginda r10.net'i acar ya da odaklanir
const goToR10 = async () => {
  const r10Tab = await checkR10TabAndExecute();

  if (r10Tab) {
    chrome.tabs.update(r10Tab.id, {selected: true});
  } else {
    chrome.tabs.create({
      url: getLocalStorageItem("notificationCount") > "0"
        ? getNotificationPageUrl()
        : getMainPageUrl()
    });
  }
};

// event listeners
chrome.runtime.onInstalled.addListener(onInit);
chrome.alarms.onAlarm.addListener(onAlarm);
chrome.browserAction.onClicked.addListener(goToR10);
