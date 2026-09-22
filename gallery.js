(function () {
  "use strict";

  var galleryEl = document.getElementById("gallery");
  var filtersEl = document.getElementById("filters");
  var emptyState = document.getElementById("emptyState");

  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxCaption = document.getElementById("lightboxCaption");

  var photos = []; // { src, albumKey, albumLabel }
  var filtered = [];
  var currentIndex = -1;
  var activeFilter = "all";

  function escaped(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function showEmpty(message, hint) {
    emptyState.querySelector("p").textContent = message;
    emptyState.querySelector("span").textContent = hint;
    emptyState.hidden = false;
  }

  function build(albums, uncategorized) {
    var albumKeys = [];

    albums.forEach(function (album) {
      albumKeys.push(album.key);
      album.photos.forEach(function (src) {
        photos.push({ src: src, albumKey: album.key, albumLabel: album.label });
      });
    });

    if (uncategorized && uncategorized.length) {
      albumKeys.push("uncategorized");
      uncategorized.forEach(function (src) {
        photos.push({ src: src, albumKey: "uncategorized", albumLabel: "Uncategorized" });
      });
    }

    renderFilters(albumKeys);

    if (!photos.length) {
      showEmpty("No photos to show yet.", "Drop images into ./images and run python3 organize_photos.py, then refresh.");
      return;
    }

    applyFilter("all");
  }

  function renderFilters(albumKeys) {
    var filters = [{ key: "all", label: "All" }];
    albumKeys.forEach(function (key) {
      filters.push({ key: key, label: key });
    });

    filters.forEach(function (f) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = f.label;
      button.dataset.filter = f.key;
      if (f.key === "all") button.classList.add("active");

      button.addEventListener("click", function () {
        applyFilter(f.key);
        document.querySelectorAll("#filters button").forEach(function (b) {
          b.classList.toggle("active", b === button);
        });
      });

      filtersEl.appendChild(button);
    });
  }

  function applyFilter(key) {
    activeFilter = key;

    if (key === "all") {
      filtered = photos.slice();
    } else {
      filtered = photos.filter(function (p) {
        return p.albumKey === key;
      });
    }

    renderGallery();

    if (key === "all") {
      galleryEl
        .querySelectorAll(".album")
        .forEach(function (albumEl) { albumEl.style.display = ""; });
    } else {
      galleryEl
        .querySelectorAll(".album")
        .forEach(function (albumEl) {
          albumEl.style.display = albumEl.dataset.albumKey === key ? "" : "none";
        });
    }
  }

  function albumTitle(section) {
    var title = document.createElement("div");
    title.className = "album-title";
    title.innerHTML =
      escaped(section.label) +
      ' <span class="album-count">' +
      section.photos.length +
      " photo" +
      (section.photos.length === 1 ? "" : "s") +
      "</span>";
    return title;
  }

  function renderGallery() {
    galleryEl.innerHTML = "";

    var sections = [];
    var seen = {};

    filtered.forEach(function (photo) {
      if (!seen[photo.albumKey]) {
        seen[photo.albumKey] = { label: photo.albumLabel, photos: [] };
        sections.push(seen[photo.albumKey]);
      }
      seen[photo.albumKey].photos.push(photo);
    });

    if (!sections.length) {
      galleryEl.style.display = "none";
      showEmpty("No photos match this filter.", "");
      return;
    }

    galleryEl.style.display = "";
    emptyState.hidden = true;

    sections.forEach(function (section) {
      var albumEl = document.createElement("section");
      albumEl.className = "album";
      albumEl.dataset.albumKey = section.photos[0].albumKey;

      if (activeFilter === "all") albumEl.appendChild(albumTitle(section));

      var grid = document.createElement("div");
      grid.className = "gallery";

      section.photos.forEach(function (photo, indexInSection) {
        var item = document.createElement("div");
        item.className = "photo";

        var img = document.createElement("img");
        img.setAttribute("src", photo.src);
        img.setAttribute("alt", photo.albumLabel + " photo");
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");

        item.appendChild(img);
        item.addEventListener("click", function () { openLightbox(indexInSection, section.photos); });
        grid.appendChild(item);
      });

      albumEl.appendChild(grid);
      galleryEl.appendChild(albumEl);
    });
  }

  function openLightbox(index, collection) {
    filtered = collection;
    currentIndex = index;
    updateLightbox();
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lightboxImg.focus();
  }

  function step(offset) {
    currentIndex = (currentIndex + offset + filtered.length) % filtered.length;
    updateLightbox();
  }

  function updateLightbox() {
    var photo = filtered[currentIndex];
    lightboxImg.src = photo.src;
    lightboxCaption.textContent = photo.albumLabel;
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lightboxImg.src = "";
  }

  lightboxClose.addEventListener("click", closeLightbox);
  lightboxNext.addEventListener("click", function () { step(1); });
  lightboxPrev.addEventListener("click", function () { step(-1); });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (event) {
    if (!lightbox.classList.contains("open")) {
      if (event.key === "Escape" && document.activeElement.tagName === "BUTTON") applyFilter("all");
      return;
    }
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowRight") step(1);
    if (event.key === "ArrowLeft") step(-1);
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