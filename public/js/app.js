/**
 * Nghịch Thủy Hàn - Bộ Chuyển Đổi QR Chuẩn VNG Games
 * Frontend Logic: Converter, QR Scanner, Visual Inspector, Instant Client-side QR Renderer
 * Hỗ trợ nhận diện khung xương model, cảnh báo tương thích và tinh chỉnh ánh sáng VNG.
 */

(function () {
  'use strict';

  // Cấu hình API: ưu tiên máy chủ nội bộ hoặc serverless proxy
  const API_BASE = (location.protocol === 'file:') ? 'http://localhost:3000' : '';

  const MODES = {
    face: { id: 'face', label: 'Khuôn Mặt', sample: '160825426', placeholder: 'Dán link chia sẻ hoặc ID mặt bản Trung (VD: 160825426)...' },
    makeup: { id: 'makeup', label: 'Trang Điểm', sample: '160500141', placeholder: 'Dán link hoặc ID trang điểm bản Trung (VD: 160500141)...' },
    hair: { id: 'hair', label: 'Màu Tóc', sample: '72616890', placeholder: 'Dán link hoặc ID màu tóc bản Trung (VD: 72616890)...' },
    top: { id: 'top', label: 'Màu Áo', sample: '30831697', placeholder: 'Dán link hoặc ID màu áo bản Trung (VD: 30831697)...' },
    bottom: { id: 'bottom', label: 'Màu Quần', sample: '30764065', placeholder: 'Dán link hoặc ID màu quần bản Trung (VD: 30764065)...' },
    photo: { id: 'photo', label: 'Chụp Ảnh', sample: '40819780', placeholder: 'Dán link hoặc ID thiết lập chụp ảnh bản Trung (VD: 40819780)...' }
  };

  const MODEL_MAP = {
    '233face01': { name: 'Nữ · Model 01', desc: 'Mặt tiêu chuẩn, cằm đầy đặn dịu dàng' },
    '233face02': { name: 'Nữ · Model 02', desc: 'Mặt ngây thơ, gò má phúng phính bầu bĩnh' },
    '233face03': { name: 'Nữ · Model 03', desc: 'Mặt quyến rũ, cằm dài thanh mảnh' },
    '233face04': { name: 'Nữ · Model 04', desc: 'Mặt sắc sảo cá tính' },
    '233face05': { name: 'Nữ · Model 05', desc: 'Mặt thanh tú, cằm nhọn V-line' },
    '233face07': { name: 'Nữ · Model 05 (Từ TRUNG 07)', desc: 'Bản Trung model 07 tự động đồng bộ sang VNG model 05' },
    '230face01': { name: 'Nam · Model 01', desc: 'Mặt nam tiêu chuẩn, cương nghị' },
    '230face02': { name: 'Nam · Model 02', desc: 'Mặt nam anh tuấn, cằm góc cạnh nam tính' },
    '230face03': { name: 'Nam · Model 03', desc: 'Mặt nam thư sinh, thanh mảnh' },
    '230face04': { name: 'Nam · Model 04', desc: 'Mặt nam chững chạc' },
    '230face07': { name: 'Nam · Model 02 (Từ TRUNG 07)', desc: 'Bản Trung model 07 tự động đồng bộ sang VNG model 02' },
    '231face01': { name: 'Loli (Tiểu nữ) · Model 01', desc: 'Khuôn mẫu loli nhỏ nhắn đáng yêu' }
  };

  const state = {
    mode: 'face',
    targetClient: 'vng_pc',
    inputTab: 'text',
    file: null,
    previewUrl: null,
    dyeMode: 'default',
    busy: false,
    currentResult: null
  };

  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  function showEl(target, visible, displayStyle) {
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    if (visible) {
      el.classList.remove('hidden');
      if (displayStyle) {
        el.style.display = displayStyle;
      } else {
        el.style.removeProperty('display');
      }
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  }

  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  // ==========================================================================
  // Khởi tạo và Điều hướng Chế độ & Nền tảng
  // ==========================================================================
  function initNavigation() {
    // Chuyển chế độ khuôn mặt, makeup, màu tóc...
    $$('.mode-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const mode = chip.dataset.mode;
        switchMode(mode);
      });
    });

    // Chuyển đổi VNG PC vs VNG Mobile
    $$('.client-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const client = tabBtn.dataset.client;
        if (state.targetClient === client) return;
        state.targetClient = client;
        $$('.client-tab').forEach(b => b.classList.toggle('active', b.dataset.client === client));
        toast(`Đã chọn nền tảng tối ưu: ${client === 'vng_mobile' ? 'VNG Mobile' : 'VNG PC'}`);
        if (state.currentResult) {
          doConvert();
        }
      });
    });

    // Chuyển tab nhập dữ liệu (link vs ảnh)
    $$('.input-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        switchInputTab(tabBtn.dataset.tab);
      });
    });

    // Tuỳ chọn nhuộm
    $$('input[name="dye_mode"]').forEach(radio => {
      radio.addEventListener('change', e => {
        state.dyeMode = e.target.value;
      });
    });
  }

  function switchMode(mode) {
    if (!MODES[mode]) return;
    state.mode = mode;
    $$('.mode-chip').forEach(c => c.classList.toggle('active', c.dataset.mode === mode));

    const cfg = MODES[mode];
    const inputField = $('share-input');
    if (inputField) inputField.placeholder = cfg.placeholder;

    // Ẩn/hiện tuỳ chọn nhuộm
    const isDye = ['hair', 'top', 'bottom'].includes(mode);
    showEl('dye-options-box', isDye);

    // Cập nhật text nút mẫu
    const sampleBtn = $('sample-btn');
    if (sampleBtn) sampleBtn.textContent = `Thử ID mẫu: ${cfg.sample}`;

    resetResult();
  }

  function switchInputTab(tab) {
    state.inputTab = tab;
    $$('.input-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    showEl('text-input-wrap', tab === 'text');
    showEl('image-input-wrap', tab === 'image');
  }

  // ==========================================================================
  // Xử Lý File & Dropzone & Clipboard
  // ==========================================================================
  function initDropzone() {
    const dropzone = $('dropzone');
    const fileInput = $('qr-file-input');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });

    $('remove-file-btn')?.addEventListener('click', removeSelectedFile);

    // Dán ảnh trực tiếp từ bộ nhớ tạm bằng Ctrl+V
    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            switchInputTab('image');
            handleFileSelect(file);
            toast('Đã dán ảnh từ Clipboard!');
            break;
          }
        }
      }
    });

    // Thử ID mẫu
    $('sample-btn')?.addEventListener('click', () => {
      switchInputTab('text');
      const cfg = MODES[state.mode];
      $('share-input').value = `https://h.163.com/avatar/#/?shareid=${cfg.sample}`;
      toast(`Đã điền mã mẫu ${cfg.sample}`);
    });
  }

  function handleFileSelect(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('Vui lòng chọn ảnh định dạng PNG, JPG hoặc WebP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Ảnh vượt quá dung lượng tối đa 8 MB.');
      return;
    }

    state.file = file;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);

    $('file-thumb').src = state.previewUrl;
    $('file-name').textContent = file.name || 'Ảnh dán từ clipboard';
    $('file-size').textContent = (file.size / 1024).toFixed(1) + ' KB';

    showEl('dropzone', false);
    showEl('file-preview-box', true, 'flex');
  }

  function removeSelectedFile() {
    state.file = null;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    $('qr-file-input').value = '';
    showEl('file-preview-box', false);
    showEl('dropzone', true);
  }

  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
      reader.readAsDataURL(file);
    });
  }

  // ==========================================================================
  // Xử Lý Chuyển Đổi (API Convert)
  // ==========================================================================
  function initConverter() {
    $('convert-btn')?.addEventListener('click', doConvert);
  }

  async function doConvert() {
    if (state.busy) return;

    let payload = {
      conversion_kind: state.mode,
      target_client: state.targetClient
    };

    if (['hair', 'top', 'bottom'].includes(state.mode)) {
      payload.dye_mode = state.dyeMode;
    }

    if (state.inputTab === 'text') {
      const inputVal = $('share-input').value.trim();
      if (!inputVal) {
        alert('Vui lòng nhập link chia sẻ hoặc mã ID bản Trung.');
        $('share-input').focus();
        return;
      }
      payload.input = inputVal;
    } else {
      if (!state.file) {
        alert('Vui lòng chọn hoặc dán ảnh chứa mã QR.');
        return;
      }
      try {
        payload.image_base64 = await readFileBase64(state.file);
      } catch (err) {
        alert('Lỗi đọc ảnh: ' + err.message);
        return;
      }
    }

    setBusy(true);

    try {
      const res = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Không thể chuyển đổi dữ liệu.');
      }

      state.currentResult = data;
      renderConversionResult(data);
      toast('Chuyển đổi thành công! Mã QR đã sẵn sàng.');
    } catch (err) {
      console.error(err);
      alert('Chuyển đổi thất bại: ' + err.message);
      resetResult();
    } finally {
      setBusy(false);
    }
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    const btn = $('convert-btn');
    if (btn) {
      btn.disabled = isBusy;
      btn.innerHTML = isBusy 
        ? `<div class="spinner" style="width:16px;height:16px;margin:0 10px 0 0;border-width:2px;display:inline-block;vertical-align:middle;"></div> <span>ĐANG CHUYỂN ĐỔI...</span>`
        : `<span class="btn-cta-diamond"></span> <span>CHUYỂN ĐỔI MÃ DIỆN MẠO SANG VNG</span> <span class="btn-cta-diamond"></span>`;
    }

    showEl('empty-state-box', isBusy ? false : !state.currentResult);
    showEl('loading-state-box', isBusy);
  }

  function resetResult() {
    state.currentResult = null;
    showEl('empty-state-box', true);
    showEl('loading-state-box', false);
    showEl('result-content-box', false);
  }

  // ==========================================================================
  // Hiển Thị Mã QR & Phân Tích Độ Chuẩn Xác (Precision Engine)
  // ==========================================================================
  function renderConversionResult(data) {
    showEl('empty-state-box', false);
    showEl('loading-state-box', false);
    showEl('result-content-box', true);

    const source = data.source || {};
    const conversion = data.conversion || {};
    const result = data.result || {};

    // 1. Tiêu đề & thông tin nhận diện
    $('res-title').textContent = source.title || `Diện mạo #${source.share_id || data.id}`;
    const genderText = source.gender === 1 ? 'Nữ' : source.gender === 0 ? 'Nam' : '';
    const modeLabel = MODES[state.mode]?.label || 'Khuôn Mặt';
    const clientLabel = state.targetClient === 'vng_mobile' ? 'VNG Mobile' : 'VNG PC';
    $('res-meta').textContent = `${genderText ? genderText + ' · ' : ''}${modeLabel} · Chuẩn ${clientLabel}`;

    // 2. Nhận Diện & Hướng Dẫn Khung Xương (Model Matcher)
    const modelCard = $('model-guidance-box');
    if (state.mode === 'face' || state.mode === 'makeup') {
      showEl(modelCard, true);
      const rawModelKey = conversion.target_face_type || conversion.face_type || conversion.source_face_type || '';
      const mappedModel = MODEL_MAP[rawModelKey];
      const modelDisplayName = mappedModel ? mappedModel.name : rawModelKey.replace('233face', 'Nữ Model ').replace('230face', 'Nam Model ');
      const modelExtraDesc = mappedModel ? mappedModel.desc : '';

      $('model-target-name').textContent = `${modelDisplayName} ${modelExtraDesc ? '— ' + modelExtraDesc : ''}`;

      const matchPill = $('model-match-pill');
      const tipDesc = $('model-tip-desc');

      if (conversion.model_changed === true) {
        matchPill.textContent = 'Đã Điều Chỉnh Model';
        matchPill.className = 'match-status-pill pill-warning';
        tipDesc.innerHTML = `Mẫu gốc dùng model chưa có ở VNG. Hệ thống đã tối ưu về <strong>${modelDisplayName}</strong> để giữ 100% thanh trượt mặt. Hãy chọn đúng <strong>${modelDisplayName}</strong> khi tạo nhân vật trước khi quét QR.`;
      } else {
        matchPill.textContent = 'Khớp Chuẩn 100% Model';
        matchPill.className = 'match-status-pill pill-success';
        tipDesc.innerHTML = `<strong>Lưu ý bắt buộc:</strong> Tại màn hình tạo nhân vật VNG, bạn hãy chọn đúng khuôn mặt <strong>${modelDisplayName}</strong> trước khi quét QR để không bị méo mặt hoặc lệch hốc mắt!`;
      }
    } else {
      showEl(modelCard, false);
    }

    // 3. Báo Cáo Tương Thích & Thay Thế Lớp Bản Quyền (Compatibility Alerts)
    const compatBox = $('compat-alerts-wrap');
    const compatList = $('compat-list-items');
    compatList.innerHTML = '';
    let alertCount = 0;

    if (Array.isArray(conversion.warnings) && conversion.warnings.length > 0) {
      conversion.warnings.forEach(w => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="bullet">•</span> <span>${w.message || w}</span>`;
        compatList.appendChild(li);
        alertCount++;
      });
    }

    if (Array.isArray(conversion.style_replacements) && conversion.style_replacements.length > 0) {
      conversion.style_replacements.forEach(sr => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="bullet">•</span> <span>Lớp trang điểm/hoa điền (ID ${sr.source_id}) bản Trung chưa cập nhật ở VNG, đã thay bằng mẫu mặc định an toàn. Bạn có thể chọn lại hoa điền trong game sau khi quét QR.</span>`;
        compatList.appendChild(li);
        alertCount++;
      });
    }

    showEl(compatBox, alertCount > 0);

    // 4. Mẹo Cân Chỉnh Ánh Sáng & Tông Da (Skin Lighting Tuner)
    const skinFields = conversion.preview_fields || [];
    const skinLight = skinFields.find(f => f.name === 'SkinLightness');
    const skinBox = $('skin-tuning-box');
    const skinDesc = $('skin-tuning-desc');

    if (skinLight && state.mode === 'face') {
      showEl(skinBox, true);
      const lightness = skinLight.after;
      if (lightness > 165) {
        skinDesc.innerHTML = `Tông da tương đối sáng (<strong>${lightness}/255</strong>). Shader đồ họa bản VNG khá rực; nếu vào game thấy mặt bị lóa dưới trời nắng gắt, bạn hãy vào mục <em>Màu Da</em> và kéo giảm nhẹ thanh <strong>Độ sáng da</strong> xuống khoảng 5–10 điểm.`;
      } else if (lightness < 90) {
        skinDesc.innerHTML = `Tông da trầm ngăm (<strong>${lightness}/255</strong>). Nếu muốn diện mạo trắng hồng hơn trong game, bạn có thể tăng nhẹ thanh <strong>Độ sáng da</strong> lên 120–140.`;
      } else {
        skinDesc.innerHTML = `Tông da đã được lượng tử hóa tự nhiên (<strong>${lightness}/255</strong>), hiển thị sắc nét và tương thích hoàn hảo với môi trường ánh sáng bản VNG.`;
      }
    } else {
      showEl(skinBox, false);
    }

    // 5. Hiển thị mã QR trực tiếp 0ms không thể lỗi
    const qrUrl = result.qr_url;
    const qrDataUrl = result.qr_data_url;
    const qrImageUrl = result.qr_image_url ? `${API_BASE}${result.qr_image_url}` : null;

    const renderTarget = $('qr-render-target');
    const resImg = $('res-qr-img');
    const downloadBtn = $('download-qr-btn');

    let qrRenderSuccess = false;

    // Cách 1 (Ưu tiên): Sinh tức thì qua QRCode.js
    if (qrUrl && typeof window.QRCode === 'function') {
      try {
        renderTarget.innerHTML = '';
        new window.QRCode(renderTarget, {
          text: qrUrl,
          width: 240,
          height: 240,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
        showEl(renderTarget, true);
        showEl(resImg, false);
        qrRenderSuccess = true;
      } catch (err) {
        console.warn('Lỗi vẽ QR client:', err);
      }
    }

    // Cách 2: Base64 data URL từ server
    if (!qrRenderSuccess && qrDataUrl) {
      resImg.src = qrDataUrl;
      showEl(renderTarget, false);
      showEl(resImg, true);
      qrRenderSuccess = true;
    }

    // Cách 3: Fallback URL ảnh server
    if (!qrRenderSuccess && qrImageUrl) {
      resImg.src = qrImageUrl;
      showEl(renderTarget, false);
      showEl(resImg, true);
      qrRenderSuccess = true;
    }

    if (qrRenderSuccess) {
      showEl('res-qr-box', true);

      const fileName = `NTH_VNG_${state.targetClient}_${state.mode}_${data.id || 'code'}.png`;
      downloadBtn.download = fileName;

      downloadBtn.onclick = () => {
        const canvas = renderTarget.querySelector('canvas');
        if (canvas) {
          downloadBtn.href = canvas.toDataURL('image/png');
          return;
        }

        const img = renderTarget.querySelector('img') || resImg;
        if (img && img.src) {
          downloadBtn.href = img.src;
          return;
        }

        if (qrDataUrl) {
          downloadBtn.href = qrDataUrl;
          return;
        }

        if (qrImageUrl) {
          downloadBtn.href = qrImageUrl;
        }
      };

      const descEl = $('res-qr-desc');
      if (state.mode === 'makeup') {
        descEl.textContent = 'Mẹo: Mở game, chọn mục "Trang Điểm" ở thanh công cụ dưới trước khi quét để giữ nguyên khuôn mặt & vóc dáng.';
      } else if (state.mode === 'photo') {
        descEl.textContent = 'Mở giao diện Đoàn Phim trong Nghịch Thủy Hàn VNG để quét ảnh QR và áp dụng góc máy & ánh sáng.';
      } else if (['hair', 'top', 'bottom'].includes(state.mode)) {
        descEl.textContent = 'Nhập QR tại giao diện Nhuộm đồ trong game hoặc bấm sao chép các mã màu RGBA bên dưới.';
      } else {
        descEl.textContent = `Mở Nghịch Thủy Hàn (${clientLabel}), vào mục Nhập Khuôn Mặt và chọn ảnh QR vừa tải.`;
      }
    } else {
      showEl('res-qr-box', false);
    }

    // 6. Nút copy link QR
    $('copy-qr-link-btn').onclick = async () => {
      if (!qrUrl) return;
      try {
        await navigator.clipboard.writeText(qrUrl);
        toast('Đã sao chép liên kết QR nạp game!');
      } catch (_) {
        prompt('Sao chép liên kết:', qrUrl);
      }
    };

    // 7. Nút tải dữ liệu thô (payload)
    if (result.payload_url) {
      const payloadUrl = `${API_BASE}${result.payload_url}`;
      $('download-payload-btn').href = payloadUrl;
      $('download-payload-btn').download = `nth_preset_${data.id || 'code'}.txt`;
      showEl('download-payload-btn', true, 'inline-flex');
    } else {
      showEl('download-payload-btn', false);
    }

    // 8. Bảng màu nhuộm (Dye colors)
    const dyeList = $('res-dye-list');
    if (conversion.colors && conversion.colors.length > 0) {
      showEl('res-dye-box', true);
      dyeList.innerHTML = '';
      conversion.colors.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'color-swatch-card';
        card.innerHTML = `
          <div class="color-box" style="background-color: ${c.rgba}"></div>
          <div class="color-code">${c.rgba.toUpperCase()}</div>
        `;
        card.onclick = () => {
          navigator.clipboard.writeText(c.rgba.toUpperCase());
          toast(`Đã sao chép mã màu ${c.rgba.toUpperCase()}`);
        };
        dyeList.appendChild(card);
      });
    } else {
      showEl('res-dye-box', false);
    }

    // 9. Chi tiết đối chiếu 49+ thông số
    const fields = conversion.preview_fields || [];
    const fieldsTable = $('res-fields-tbody');
    fieldsTable.innerHTML = '';
    fields.forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:#fff;font-weight:600;">${f.label || f.name}</td>
        <td style="color:var(--text-muted);">${f.before}</td>
        <td style="color:var(--gold-glow);font-weight:700;">${f.after}</td>
      `;
      fieldsTable.appendChild(tr);
    });

    $('stats-converted-count').textContent = conversion.converted_count || '0';
    $('stats-quantized-count').textContent = conversion.quantized_count || '0';
  }

  // ==========================================================================
  // Trạng Thái Máy Chủ
  // ==========================================================================
  async function checkServerStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      const cfg = await res.json();
      $('status-text').textContent = 'Hệ thống sẵn sàng';
      $('status-dot').style.background = 'var(--jade-glow)';
    } catch (_) {
      $('status-text').textContent = 'Chế độ Trực Tiếp';
      $('status-dot').style.background = 'var(--gold-glow)';
    }
  }

  // Khởi động ứng dụng khi DOM sẵn sàng
  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initDropzone();
    initConverter();
    checkServerStatus();
  });
})();
