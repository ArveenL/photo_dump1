(function () {
  "use strict";

  var galleryEl = document.getElementById("gallery");
  var backBtn = document.getElementById("backBtn");
  var emptyState = document.getElementById("emptyState");

  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxCaption = document.getElementById("lightboxCaption");

  var folders = []; // { key, label, photos: [] }
  var currentFolder = null;
  var currentPhotos = [];
  var currentIndex = -1;

  function groupEl(label, photos) {
    var albumEl = document.createElement("section");
    albumEl.className = "album";

    var title = document.createElement("h2");
    title.className = "album-title";
    title.textContent = label;

    var count = document.createElement("span");
    count.className = "album-count";
    count.textContent = photos.length + " photo" + (photos.length === 1 ? "" : "s");
    title.appendChild(count);

    var grid = document.createElement("div");
    grid.className = "gallery";

    photos.forEach(function (photo, index) {
      var item = document.createElement("div");
      item.className = "photo";

      var img = document.createElement("img");
      img.setAttribute("src", photo.src);
      img.setAttribute("alt", "Photo");
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");

      item.appendChild(img);
      item.addEventListener("click", function () {
        openLightboxAt(photos, index);
      });
      grid.appendChild(item);
    });

    albumEl.appendChild(title);
    albumEl.appendChild(grid);
    return albumEl;
  }

  function setBackVisible(visible) {
    backBtn.hidden = !visible;
  }

  function renderFolders() {
    currentFolder = null;
    galleryEl.innerHTML = "";
    galleryEl.classList.add("folder-grid");
    setBackVisible(false);

    folders.forEach(function (folder) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "folder-card";

      var name = document.createElement("span");
      name.className = "folder-name";
      name.textContent = folder.label;

      var count = document.createElement("span");
      count.className = "folder-count";
      count.textContent = folder.photos.length + " photo" + (folder.photos.length === 1 ? "" : "s");

      card.appendChild(name);
      card.appendChild(count);
      card.addEventListener("click", function () { openFolder(folder); });
      galleryEl.appendChild(card);
    });
  }

  function openFolder(folder) {
    currentFolder = folder;
    galleryEl.classList.remove("folder-grid");
    galleryEl.innerHTML = "";
    setBackVisible(true);
    galleryEl.appendChild(groupEl(folder.label, folder.photos));
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function build(albums, uncategorized) {
    if (!albums || !albums.length) {
      if (!uncategorized || !uncategorized.length) {
        showEmpty("No photos to show yet.", "Drop images into ./images and run python3 organize_photos.py, then refresh.");
        return;
      }
    }

    albums.forEach(function (album) {
      var photos = album.photos.map(function (src) {
        return { src: src };
      });
      folders.push({ key: album.key, label: album.label, photos: photos });
    });

    if (uncategorized && uncategorized.length) {
      folders.push({
        key: "uncategorized",
        label: "Uncategorized",
        photos: uncategorized.map(function (src) { return { src: src }; }),
      });
    }

    renderFolders();
  }

  function showEmpty(message, hint) {
    emptyState.querySelector("p").textContent = message;
    emptyState.querySelector("span").textContent = hint;
    emptyState.hidden = false;
  }

  function openLightboxAt(photos, index) {
    currentPhotos = photos;
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lightboxImg.focus();
  }

  function step(offset) {
    currentIndex = (currentIndex + offset + currentPhotos.length) % currentPhotos.length;
    updateLightbox();
  }

  function updateLightbox() {
    var photo = currentPhotos[currentIndex];
    lightboxImg.src = photo.src;
    lightboxCaption.textContent = currentFolder ? currentFolder.label : "";
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lightboxImg.src = "";
  }

  backBtn.addEventListener("click", renderFolders);

  var homeBtn = document.getElementById("homeBtn");
  homeBtn.addEventListener("click", function () {
    renderFolders();
    window.scrollTo({ top: 0, behavior: "auto" });
  });

  lightboxClose.addEventListener("click", closeLightbox);
  lightboxNext.addEventListener("click", function () { step(1); });
  lightboxPrev.addEventListener("click", function () { step(-1); });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.classList.contains("open")) {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
      return;
    }
    if (event.key === "Escape" && currentFolder) renderFolders();
  });

  fetch("gallery-data.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      build(data.albums || [], data.uncategorized || []);
    })
    .catch(function () {
      showEmpty(
        "Could not load gallery data.",
        "Serve this folder with python3 -m http.server 8000 (file:// blocks fetching JSON), then refresh."
      );
    });
})();