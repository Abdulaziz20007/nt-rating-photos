// ==UserScript==
// @name         NT Student Photos
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Display student photos in NT rating table with fullscreen view
// @author       https://little_coder.t.me
// @match        https://erp.student.najottalim.uz/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  "use strict";

  // Add CSS for fullscreen modal
  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .photo-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .photo-modal-overlay.visible {
        opacity: 1;
      }
      
      .photo-modal-content {
        position: relative;
        max-width: 90%;
        max-height: 90%;
        overflow: hidden;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
      }
      
      .photo-modal-img {
        display: block;
        max-width: 100%;
        max-height: 90vh;
        object-fit: contain;
      }
      
      .photo-modal-close {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 30px;
        height: 30px;
        background-color: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        font-size: 20px;
        font-weight: bold;
        color: #000;
      }
      
      .photo-modal-name {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px;
        text-align: center;
        font-weight: bold;
      }
      
      .student-photo {
        cursor: pointer;
        transition: transform 0.2s ease;
      }
      
      .student-photo:hover {
        transform: scale(1.1);
      }
      
      .photo-controls {
        display: flex;
        justify-content: center;
        gap: 5px;
        margin-top: 5px;
      }
      
      .rotate-btn {
        width: 20px;
        height: 20px;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 10px;
      }
      
      .rotate-btn:hover {
        background-color: rgba(0, 0, 0, 0.9);
      }
    `;
    document.head.appendChild(style);
  }

  // Create modal elements
  function createPhotoModal() {
    const modalOverlay = document.createElement("div");
    modalOverlay.className = "photo-modal-overlay";
    modalOverlay.style.display = "none";

    const modalContent = document.createElement("div");
    modalContent.className = "photo-modal-content";

    const modalImg = document.createElement("img");
    modalImg.className = "photo-modal-img";

    const modalClose = document.createElement("div");
    modalClose.className = "photo-modal-close";
    modalClose.textContent = "×";
    modalClose.addEventListener("click", closePhotoModal);

    const modalName = document.createElement("div");
    modalName.className = "photo-modal-name";

    modalContent.appendChild(modalImg);
    modalContent.appendChild(modalClose);
    modalContent.appendChild(modalName);
    modalOverlay.appendChild(modalContent);

    // Close on overlay click
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        closePhotoModal();
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalOverlay.style.display !== "none") {
        closePhotoModal();
      }
    });

    document.body.appendChild(modalOverlay);
    return { modalOverlay, modalImg, modalName };
  }

  // Store the student data
  let studentData = null;

  // Local storage key for rotations
  const ROTATIONS_STORAGE_KEY = "nt_student_photos_rotations";

  // Function to get stored rotations
  function getStoredRotations() {
    try {
      const stored = localStorage.getItem(ROTATIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("Error retrieving rotations from localStorage:", e);
      return {};
    }
  }

  // Function to save rotation for a student
  function saveRotation(studentId, rotation) {
    try {
      const rotations = getStoredRotations();
      rotations[studentId] = rotation;
      localStorage.setItem(ROTATIONS_STORAGE_KEY, JSON.stringify(rotations));
    } catch (e) {
      console.error("Error saving rotation to localStorage:", e);
    }
  }

  // Function to get rotation for a student
  function getRotation(studentId) {
    const rotations = getStoredRotations();
    return rotations[studentId] || 0;
  }

  // Function to fetch student data directly from the API
  async function fetchStudentData() {
    try {
      // Get pagination params from current page state
      const perPageValue = getCurrentPerPage();
      const currentPage = getCurrentPage();

      console.log(
        `Fetching data for page ${currentPage} with ${perPageValue} items per page`
      );

      // Construct API URL
      const apiUrl = `https://erp.api.najottalim.uz/api/student/awards/statistics?page=${currentPage}&perPage=${perPageValue}&sortBy=xp&orderBy=DESC&statusId=1`;

      // Fetch data from API
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      });

      const data = await response.json();

      if (
        data &&
        data.success &&
        data.data &&
        data.data.studentStatisticsData &&
        data.data.studentStatisticsData.statistics
      ) {
        // Store the statistics array for later use
        studentData = data.data.studentStatisticsData.statistics;

        console.log(`Received ${studentData.length} student records`);

        // Replace table with new one containing photos
        replaceTable();
      }
    } catch (error) {
      console.error("Error fetching student data:", error);
    }
  }

  // Helper function to get current perPage value with improved reliability
  function getCurrentPerPage() {
    try {
      // First try to read from select element
      const perPageSelect = document.querySelector(
        ".MuiTablePagination-select"
      );
      if (perPageSelect) {
        const perPageValue = perPageSelect.textContent.trim();
        if (["10", "20", "50", "100"].includes(perPageValue)) {
          return perPageValue;
        }
      }

      // Next try to read from the native input
      const nativeInput = document.querySelector(
        '.MuiSelect-nativeInput[aria-hidden="true"]'
      );
      if (nativeInput && nativeInput.value) {
        const value = nativeInput.value;
        if (["10", "20", "50", "100"].includes(value)) {
          return value;
        }
      }

      // Look for the selected menu item
      const menuItems = document.querySelectorAll(".MuiMenuItem-root");
      for (const item of menuItems) {
        if (item.getAttribute("aria-selected") === "true") {
          const value = item.textContent.trim();
          if (["10", "20", "50", "100"].includes(value)) {
            return value;
          }
        }
      }

      // Fallback - check the displayed row count
      const displayedRows = document.querySelector(
        ".MuiTablePagination-displayedRows"
      );
      if (displayedRows) {
        const text = displayedRows.textContent;
        const match = text.match(/1-(\d+)/);
        if (match && match[1]) {
          return match[1];
        }
      }

      return "10"; // Default
    } catch (e) {
      console.error("Error getting perPage value:", e);
      return "10"; // Default
    }
  }

  // Helper function to get current page with improved reliability
  function getCurrentPage() {
    try {
      let page = "1"; // Default to first page

      // Try to read from pagination component first
      const selectedPage = document.querySelector(
        ".MuiPaginationItem-page.Mui-selected"
      );
      if (selectedPage) {
        page = selectedPage.textContent.trim();
      } else {
        // Try to extract from URL query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = urlParams.get("page");
        if (pageParam) {
          page = pageParam;
        } else {
          // Try to get from page input if available
          const pageInput = document.querySelector(
            "input.MuiTablePagination-input"
          );
          if (pageInput && pageInput.value) {
            page = pageInput.value;
          } else {
            // Try to extract from displayed text (e.g., "1-10 of 100")
            const displayedText = document.querySelector(
              ".MuiTablePagination-displayedRows"
            );
            if (displayedText) {
              const text = displayedText.textContent;
              // If showing first page items (1-X)
              if (text.startsWith("1-")) {
                page = "1";
              } else {
                // If format is like "11-20 of 100", extract the page
                const match = text.match(/(\d+)-\d+ .*? \d+/);
                if (match && match[1]) {
                  const firstItem = parseInt(match[1]);
                  const perPage = parseInt(getCurrentPerPage());
                  if (!isNaN(firstItem) && !isNaN(perPage) && perPage > 0) {
                    page = Math.ceil(firstItem / perPage).toString();
                  }
                }
              }
            }
          }
        }
      }

      // Validate page number - ensure it's at least 1
      const pageNum = parseInt(page);
      if (isNaN(pageNum) || pageNum < 1) {
        return "1";
      }

      return pageNum.toString();
    } catch (e) {
      console.error("Error getting current page:", e);
      return "1"; // Default
    }
  }

  // Helper function to get authentication headers from the current session
  function getAuthHeaders() {
    // Get authentication token from localStorage
    const token = localStorage.getItem("accessToken") || "";

    if (token) {
      return {
        Authorization: `Bearer ${token}`,
      };
    }

    return {};
  }

  // Function to replace the table with our custom one
  function replaceTable() {
    if (!studentData || studentData.length === 0) return;

    // Confirm we should process this table
    if (!shouldProcessTable()) {
      console.log("Table verification failed, not modifying the table");
      return;
    }

    const tableContainer = document.querySelector(".MuiTableContainer-root");
    if (!tableContainer) return;

    // Save the original table for reference of styles and structure
    const originalTable = tableContainer.querySelector("table");
    if (!originalTable) return;

    console.log("Confirmed rating table, proceeding with modification");

    // Create new table with the same classes
    const newTable = document.createElement("table");
    newTable.className = originalTable.className;

    // Create the header
    const thead = document.createElement("thead");
    thead.className = "MuiTableHead-root css-1wbz3t9";

    // Create a new header row
    const headerRow = document.createElement("tr");
    headerRow.className = "MuiTableRow-root MuiTableRow-head css-ym9ojk";

    // Create header cells
    const headers = [
      { text: "Reyting", attrs: {} },
      { text: "Rasm", attrs: {} },
      { text: "Ism-familiya", attrs: {} },
      { text: "Kurs", attrs: {} },
      { text: "Holati", attrs: {} },
      {
        text: "Bosqich",
        attrs: {},
        button: {
          className:
            "MuiButtonBase-root MuiIconButton-root MuiIconButton-colorInherit MuiIconButton-sizeMedium css-1deacqj",
          icon: "ArrowUpwardIcon",
          path: "m4 12 1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z",
        },
      },
      {
        text: "XP",
        attrs: {},
        button: {
          className:
            "MuiButtonBase-root MuiIconButton-root MuiIconButton-colorSuccess MuiIconButton-sizeMedium css-nzkk3",
          icon: "ArrowDownwardIcon",
          path: "m20 12-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8z",
        },
      },
      {
        text: "Kumush",
        attrs: {},
        button: {
          className:
            "MuiButtonBase-root MuiIconButton-root MuiIconButton-colorInherit MuiIconButton-sizeMedium css-1deacqj",
          icon: "ArrowUpwardIcon",
          path: "m4 12 1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z",
        },
      },
    ];

    // Add header cells to row
    headers.forEach((header) => {
      const th = document.createElement("th");
      th.className =
        "MuiTableCell-root MuiTableCell-head MuiTableCell-sizeMedium css-1hj92n3";
      th.scope = "col";

      // Add text
      th.textContent = header.text;

      // Add attributes
      if (header.attrs) {
        Object.keys(header.attrs).forEach((attr) => {
          th.setAttribute(attr, header.attrs[attr]);
        });
      }

      // Add button if specified
      if (header.button) {
        const button = document.createElement("button");
        button.className = header.button.className;
        button.tabIndex = "0";
        button.type = "button";

        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg"
        );
        svg.classList.add(
          "MuiSvgIcon-root",
          "MuiSvgIcon-fontSizeMedium",
          "css-vubbuv"
        );
        svg.setAttribute("focusable", "false");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("data-testid", header.button.icon);

        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        path.setAttribute("d", header.button.path);

        svg.appendChild(path);
        button.appendChild(svg);

        const span = document.createElement("span");
        span.className = "MuiTouchRipple-root css-w0pj6f";
        button.appendChild(span);

        th.appendChild(button);
      }

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    newTable.appendChild(thead);

    // Create the body with students data
    const tbody = document.createElement("tbody");
    tbody.className = "MuiTableBody-root css-1xnox0e";

    // Base URL for photos
    const baseUrl = "https://pub-7be1d45c4a744f86846c80e90df909eb.r2.dev/";

    // Get the current user ID if available for highlighting
    const currentUser = getLoggedInUserData();

    studentData.forEach((student, index) => {
      const position = student.position;

      // Create student full name
      const fullName = `${student.firstName} ${student.lastName} ${
        student.middleName || ""
      }`.trim();

      // Check if this is the current user to highlight the row
      const isCurrentUser = currentUser && currentUser.id === student.id;

      // Create row with appropriate classes
      const row = document.createElement("tr");
      row.className = isCurrentUser
        ? "MuiTableRow-root MuiTableRow-hover css-dswht0"
        : "MuiTableRow-root MuiTableRow-hover css-1pzv3w8";

      // Create cells

      // Position cell
      const positionCell = document.createElement("td");
      positionCell.className = isCurrentUser
        ? "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-1q239e8"
        : "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      positionCell.setAttribute("data-th", "Reyting");
      positionCell.innerHTML = `<span>${position}</span>`;
      row.appendChild(positionCell);

      // Photo cell
      const photoCell = document.createElement("td");
      photoCell.className =
        "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      photoCell.setAttribute("data-th", "Rasm");

      // Create a container for the photo and controls
      const photoContainer = document.createElement("div");
      photoContainer.style.display = "flex";
      photoContainer.style.flexDirection = "column";
      photoContainer.style.alignItems = "center";

      const img = document.createElement("img");
      img.className = "student-photo";
      img.style.width = "40px";
      img.style.height = "40px";
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";
      img.style.transition = "transform 0.2s ease";

      // Get saved rotation (if any) for this student
      const savedRotation = getRotation(student.id);
      img.dataset.rotation = savedRotation;
      if (savedRotation !== 0) {
        img.style.transform = `rotate(${savedRotation}deg)`;
      }

      let imgSrc = "https://via.placeholder.com/40";
      if (student.photo) {
        imgSrc = baseUrl + student.photo;
        img.alt = fullName;
      } else {
        img.alt = "No photo";
      }

      img.src = imgSrc;

      // Add click event for fullscreen
      img.addEventListener("click", function () {
        openPhotoModal(imgSrc, fullName, student.id);
      });

      photoContainer.appendChild(img);

      // Create rotation controls
      const controlsDiv = document.createElement("div");
      controlsDiv.className = "photo-controls";

      // Left rotation button
      const rotateLeftBtn = document.createElement("button");
      rotateLeftBtn.className = "rotate-btn";
      rotateLeftBtn.innerHTML = "↺";
      rotateLeftBtn.title = "Rotate left";
      rotateLeftBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const currentRotation = parseInt(img.dataset.rotation) || 0;
        const newRotation = currentRotation - 90;
        img.dataset.rotation = newRotation;
        img.style.transform = `rotate(${newRotation}deg)`;
        saveRotation(student.id, newRotation);
      });

      // Right rotation button
      const rotateRightBtn = document.createElement("button");
      rotateRightBtn.className = "rotate-btn";
      rotateRightBtn.innerHTML = "↻";
      rotateRightBtn.title = "Rotate right";
      rotateRightBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const currentRotation = parseInt(img.dataset.rotation) || 0;
        const newRotation = currentRotation + 90;
        img.dataset.rotation = newRotation;
        img.style.transform = `rotate(${newRotation}deg)`;
        saveRotation(student.id, newRotation);
      });

      controlsDiv.appendChild(rotateLeftBtn);
      controlsDiv.appendChild(rotateRightBtn);
      photoContainer.appendChild(controlsDiv);

      photoCell.appendChild(photoContainer);
      row.appendChild(photoCell);

      // Name cell
      const nameCell = document.createElement("td");
      nameCell.className = isCurrentUser
        ? "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-1q239e8"
        : "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      nameCell.setAttribute("data-th", "Ism-familiya");
      nameCell.innerHTML = `<span>${fullName}</span>`;
      row.appendChild(nameCell);

      // Courses cell
      const coursesCell = document.createElement("td");
      coursesCell.className = isCurrentUser
        ? "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-1q239e8"
        : "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      coursesCell.setAttribute("data-th", "Kurs");

      let coursesList = "<ol>";
      if (student.courses && student.courses.length > 0) {
        student.courses.forEach((course) => {
          coursesList += `<li>${course.name}</li>`;
        });
      }
      coursesList += "</ol>";
      coursesCell.innerHTML = coursesList;
      row.appendChild(coursesCell);

      // Status cell
      const statusCell = document.createElement("td");
      statusCell.className = isCurrentUser
        ? "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-1q239e8"
        : "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      statusCell.setAttribute("data-th", "Holati");
      statusCell.innerHTML = `<span>${student.status}</span>`;
      row.appendChild(statusCell);

      // Level cell
      const levelCell = document.createElement("td");
      levelCell.className = isCurrentUser
        ? "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-1q239e8"
        : "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      levelCell.setAttribute("data-th", "[object Object]");
      levelCell.innerHTML = `<span>${student.level}</span>`;
      row.appendChild(levelCell);

      // XP cell
      const xpCell = document.createElement("td");
      xpCell.className = isCurrentUser
        ? "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-1q239e8"
        : "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      xpCell.setAttribute("data-th", "[object Object]");
      xpCell.innerHTML = `<span>${student.xp}</span>`;
      row.appendChild(xpCell);

      // Coin cell
      const coinCell = document.createElement("td");
      coinCell.className = isCurrentUser
        ? "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-1q239e8"
        : "MuiTableCell-root MuiTableCell-body MuiTableCell-sizeMedium css-wsooev";
      coinCell.setAttribute("data-th", "[object Object]");
      coinCell.innerHTML = `<span>${student.coin}</span>`;
      row.appendChild(coinCell);

      // Add the row to table body
      tbody.appendChild(row);
    });

    newTable.appendChild(tbody);

    // Replace the original table with our new one
    tableContainer.replaceChild(newTable, originalTable);
  }

  // Function to get data about the logged in user
  function getLoggedInUserData() {
    try {
      // Try to get user data from localStorage
      const userInfoStr = localStorage.getItem("userInfo");
      if (userInfoStr) {
        return JSON.parse(userInfoStr);
      }

      // Alternative: if userInfo is not available, try to check student ID from current highlighted row
      const highlightedRow = document.querySelector(
        ".MuiTableRow-hover.css-dswht0"
      );
      if (highlightedRow) {
        const nameCell = highlightedRow.querySelector(
          '[data-th="Ism-familiya"] span'
        );
        if (nameCell && nameCell.textContent) {
          // Return partial info with just the name
          return { fullName: nameCell.textContent.trim() };
        }
      }

      return null;
    } catch (e) {
      console.error("Error getting user data:", e);
      return null;
    }
  }

  // Function to listen for navigation and pagination changes
  function listenForNavigationChanges() {
    // Monitor URL changes
    let lastUrl = location.href;

    // Create a new observer for URL changes
    const urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;

        // URL changed, refetch data with new parameters
        setTimeout(() => {
          fetchStudentData();
        }, 500);
      }
    });

    // Start observing the document
    urlObserver.observe(document, { subtree: true, childList: true });

    // Enhanced pagination detection - watch for any changes in the pagination controls
    document.addEventListener("click", (event) => {
      // Detect clicks specifically on pagination controls
      const paginationButton =
        event.target.closest(".MuiPaginationItem-page") ||
        event.target.closest(
          '.MuiButtonBase-root[aria-label="Go to next page"]'
        ) ||
        event.target.closest(
          '.MuiButtonBase-root[aria-label="Go to previous page"]'
        );

      if (paginationButton) {
        console.log("Pagination button clicked");
        // Use a slightly longer delay for pagination to ensure the UI updates
        setTimeout(() => {
          fetchStudentData();
        }, 600);
      }

      // Check for perPage dropdown clicks separately
      const perPageDropdown =
        event.target.closest(".MuiTablePagination-select") ||
        event.target.closest('[data-testid="ArrowDropDownIcon"]');

      if (perPageDropdown) {
        console.log("PerPage dropdown clicked");
        // Use a slightly longer delay for dropdown to ensure the UI updates
        setTimeout(() => {
          fetchStudentData();
        }, 600);
      }
    });

    // Add broader mutation observer to detect dropdown changes
    const pageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check if the pagination area changed
        if (mutation.type === "childList" || mutation.type === "attributes") {
          const paginationElement = mutation.target.closest(
            ".MuiTablePagination-root"
          );
          if (paginationElement) {
            console.log("Pagination area changed");
            setTimeout(() => {
              fetchStudentData();
            }, 400);
            break;
          }
        }
      }
    });

    // Observe the entire table container for pagination changes
    const tableContainer = document.querySelector(".MuiPaper-root");
    if (tableContainer) {
      pageObserver.observe(tableContainer, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    // Direct observation of the pagination controls
    const paginationControls = document.querySelector(
      ".MuiTablePagination-root"
    );
    if (paginationControls) {
      const paginationObserver = new MutationObserver(() => {
        console.log("Pagination controls changed");
        setTimeout(() => {
          fetchStudentData();
        }, 400);
      });

      paginationObserver.observe(paginationControls, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }

    // Listen for any MUI dropdown item selection events
    document.addEventListener("mousedown", (event) => {
      const isMenuItem = event.target.closest(".MuiMenuItem-root");
      if (isMenuItem) {
        console.log("Menu item clicked");
        setTimeout(() => {
          fetchStudentData();
        }, 600);
      }
    });
  }

  // Open photo modal
  function openPhotoModal(imgSrc, studentName, studentId) {
    const { modalOverlay, modalImg, modalName } = getModalElements();

    modalImg.src = imgSrc;
    modalImg.dataset.studentId = studentId || "";

    // Get saved rotation for this student in the modal
    const savedRotation = studentId ? getRotation(studentId) : 0;
    modalImg.dataset.rotation = savedRotation;
    modalImg.style.transform = `rotate(${savedRotation}deg)`;

    modalName.textContent = studentName || "";

    // Add rotation controls to fullscreen view
    let modalControls = modalOverlay.querySelector(".modal-photo-controls");
    if (!modalControls) {
      modalControls = document.createElement("div");
      modalControls.className = "photo-controls modal-photo-controls";
      modalControls.style.position = "absolute";
      modalControls.style.bottom = "50px";
      modalControls.style.left = "50%";
      modalControls.style.transform = "translateX(-50%)";
      modalControls.style.zIndex = "10000";

      // Left rotation button
      const rotateLeftBtn = document.createElement("button");
      rotateLeftBtn.className = "rotate-btn";
      rotateLeftBtn.style.width = "30px";
      rotateLeftBtn.style.height = "30px";
      rotateLeftBtn.style.fontSize = "16px";
      rotateLeftBtn.innerHTML = "↺";
      rotateLeftBtn.title = "Rotate left";
      rotateLeftBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const currentRotation = parseInt(modalImg.dataset.rotation || "0");
        const newRotation = currentRotation - 90;
        modalImg.dataset.rotation = newRotation;
        modalImg.style.transform = `rotate(${newRotation}deg)`;

        // Save rotation if student ID is available
        const studentId = modalImg.dataset.studentId;
        if (studentId) {
          saveRotation(studentId, newRotation);
        }
      });

      // Right rotation button
      const rotateRightBtn = document.createElement("button");
      rotateRightBtn.className = "rotate-btn";
      rotateRightBtn.style.width = "30px";
      rotateRightBtn.style.height = "30px";
      rotateRightBtn.style.fontSize = "16px";
      rotateRightBtn.innerHTML = "↻";
      rotateRightBtn.title = "Rotate right";
      rotateRightBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const currentRotation = parseInt(modalImg.dataset.rotation || "0");
        const newRotation = currentRotation + 90;
        modalImg.dataset.rotation = newRotation;
        modalImg.style.transform = `rotate(${newRotation}deg)`;

        // Save rotation if student ID is available
        const studentId = modalImg.dataset.studentId;
        if (studentId) {
          saveRotation(studentId, newRotation);
        }
      });

      modalControls.appendChild(rotateLeftBtn);
      modalControls.appendChild(rotateRightBtn);

      modalOverlay
        .querySelector(".photo-modal-content")
        .appendChild(modalControls);
    }

    modalOverlay.style.display = "flex";
    setTimeout(() => {
      modalOverlay.classList.add("visible");
    }, 10);
  }

  // Close photo modal
  function closePhotoModal() {
    const { modalOverlay } = getModalElements();

    modalOverlay.classList.remove("visible");
    setTimeout(() => {
      modalOverlay.style.display = "none";
    }, 300);
  }

  // Get or create modal elements
  function getModalElements() {
    let modalOverlay = document.querySelector(".photo-modal-overlay");
    if (!modalOverlay) {
      return createPhotoModal();
    }

    return {
      modalOverlay,
      modalImg: modalOverlay.querySelector(".photo-modal-img"),
      modalName: modalOverlay.querySelector(".photo-modal-name"),
    };
  }

  // Function to check if we're on the rating page
  function isRatingPage() {
    // Check URL matches the rating page
    const isRatingURL =
      /^https:\/\/erp\.student\.najottalim\.uz\/rating\/?$/.test(
        window.location.href
      );
    if (!isRatingURL) return false;

    // Additional check: look for rating-specific elements
    return true;
  }

  // Function to verify the table is the student rating table
  function isRatingTable(table) {
    if (!table) return false;

    // Check for table structure that matches the rating table
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) return false;

    // Check for characteristic column headers that would be in the rating table
    const headers = headerRow.querySelectorAll("th");
    if (headers.length < 5) return false; // Rating table has multiple columns

    // Look for specific headers like "Reyting", "Ism-familiya", "XP", etc.
    const headerTexts = Array.from(headers).map((th) => th.textContent.trim());
    return (
      headerTexts.includes("Reyting") ||
      headerTexts.includes("Ism-familiya") ||
      headerTexts.includes("XP") ||
      headerTexts.includes("Bosqich")
    );
  }

  // Function to find the student rating table
  function findRatingTable() {
    // First, make sure we're on the rating page
    if (!isRatingPage()) return null;

    // Find all tables in the document
    const tables = document.querySelectorAll("table");

    // Check each table to find the one that's the rating table
    for (const table of tables) {
      if (isRatingTable(table)) {
        return table;
      }
    }

    return null;
  }

  // Function to check if table should be processed
  function shouldProcessTable() {
    // Check if URL is the rating page
    if (
      !/^https:\/\/erp\.student\.najottalim\.uz\/rating\/?$/.test(
        window.location.href
      )
    ) {
      console.log("Not on rating page, script will not run");
      return false;
    }

    // Find the table
    const table = document.querySelector(".MuiTable-root");
    if (!table) {
      console.log("Table not found");
      return false;
    }

    // Verify it's the rating table by checking for specific columns
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
      th.textContent.trim()
    );

    // Check for at least 3 of these rating-specific columns
    const ratingColumns = [
      "Reyting",
      "Ism-familiya",
      "XP",
      "Kumush",
      "Bosqich",
      "Kurs",
    ];
    const matchingColumns = ratingColumns.filter((col) =>
      headers.includes(col)
    );

    if (matchingColumns.length < 3) {
      console.log("Not a rating table based on columns");
      return false;
    }

    return true;
  }

  // Initialize the script
  async function init() {
    // Add styles for fullscreen modal
    addStyles();

    // Create modal elements
    createPhotoModal();

    // Wait for the table to be available
    const waitForTable = () => {
      return new Promise((resolve) => {
        const checkTable = setInterval(() => {
          const table = document.querySelector(".MuiTable-root");
          if (table) {
            clearInterval(checkTable);
            resolve();
          }
        }, 100);
      });
    };

    await waitForTable();

    // Initial data fetch
    fetchStudentData();

    // Listen for changes that require refetching
    listenForNavigationChanges();
  }

  // Run the script when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
