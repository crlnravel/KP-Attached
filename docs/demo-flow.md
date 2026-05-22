# ATTACHED Demo Flow

Dokumen ini berisi skenario demonstrasi singkat untuk menunjukkan fitur utama ATTACHED sebagai CDSS lokal-first.

## 1. Akses dan Persetujuan Psikolog

1. Buka aplikasi dan tunjukkan halaman masuk.
2. Jika memakai akun baru, ajukan akses psikolog dengan profil dan dokumen verifikasi.
3. Masuk sebagai admin lokal.
4. Buka halaman admin, review detail psikolog, lalu setujui atau tolak akses.
5. Tunjukkan halaman riwayat admin untuk membatalkan keputusan penerimaan atau penolakan bila diperlukan.
6. Masuk sebagai psikolog yang sudah disetujui.

## 2. Dashboard Psikolog

1. Tunjukkan ringkasan sesi di dashboard.
2. Gunakan dropdown filter status untuk melihat Secure, Insecure, galat, belum selesai, atau dibatalkan.
3. Klik salah satu entri untuk membuka detail asesmen.
4. Di detail asesmen, tunjukkan hasil, probabilitas kelas, peserta, progres rekaman, dan status feedback klinisi.
5. Jika perlu, gunakan aksi "Hapus rekaman" untuk menghapus exposure, respons video, dan audio tanpa menghapus detail asesmen.

## 3. Sesi Asesmen Baru

1. Klik mulai sesi baru.
2. Tunjukkan ID peserta yang dibuat otomatis dan tidak dapat diedit.
3. Isi identitas dasar peserta.
4. Tunjukkan halaman consent yang menjelaskan:
   - data yang direkam,
   - pemrosesan model lokal,
   - feedback klinisi,
   - report lokal untuk audit atau persiapan training ulang,
   - opsi penghapusan data bila peserta tidak menyetujui penyimpanan lanjutan.
5. Lanjut ke cek perangkat.
6. Tunjukkan kamera dan indikator mikrofon vertikal.

## 4. Stimulus dan Respons

1. Tunjukkan prompt konfirmasi sebelum stimulus.
2. Lanjutkan ke stimulus gambar full screen.
3. Setelah exposure selesai, tunjukkan sesi respons full screen dengan prompt verbal.
4. Jelaskan bahwa respons video dan audio direkam untuk pipeline lokal.
5. Ulangi alur sampai 14 stimulus selesai.

## 5. Kuesioner ECR-RS

1. Tunjukkan 36 item ECR-RS.
2. Pilih jawaban skala 1-6 untuk setiap item.
3. Saat submit, tunjukkan modal konfirmasi karena pengguna tidak bisa kembali ke halaman sebelumnya setelah submit.

## 6. Analisis Lokal

1. Tunjukkan halaman "Data Selesai Didapatkan".
2. Klik "Lanjut" untuk menjalankan pipeline model lokal.
3. Tunjukkan status pemrosesan lokal.
4. Jelaskan bahwa aplikasi memakai artefak raw sesi, ECR-RS, dan backend lokal `data_model_KP/run_model`.

## 7. Hasil dan Feedback Klinisi

1. Tunjukkan hasil utama Secure atau Insecure.
2. Tunjukkan detail hasil: keyakinan, versi model, percobaan inferensi, durasi, probabilitas kelas, dan skor ECR-RS.
3. Pilih "Sesuai" bila hasil model selaras dengan penilaian klinisi.
4. Pilih "Tidak sesuai" bila klinisi ingin membalik label hasil.
5. Tunjukkan modal konfirmasi feedback.
6. Jelaskan bahwa feedback disimpan di database lokal dan dibuatkan report training `.json` serta `.csv` di `web/artifacts/training-reports`.

## 8. Penghapusan Data

1. Di halaman hasil, gunakan "Hapus data sesi" bila peserta tidak menyetujui penyimpanan lanjutan.
2. Jelaskan bahwa aksi ini menghapus sesi, rekaman lokal, output model, dan report training sesi tersebut.
3. Di detail sesi dashboard, gunakan "Hapus rekaman" bila hanya file rekaman yang perlu dihapus tetapi detail asesmen tetap dipertahankan.
4. Di profil psikolog, gunakan "Hapus data lokal" untuk menghapus akun, sesi, hasil, rekaman, report training, dan artefak lokal pada workstation.

## 9. Mode Uji dan Fixture Lokal

1. Pada mode pengembangan, gunakan tombol mode uji untuk mengisi sesi dengan fixture lokal.
2. Jika folder `Nabila Dhiya Permatasari` tersedia, aplikasi memakai data raw dan workbook ECR-RS dari folder tersebut.
3. Jika folder tidak tersedia, aplikasi memakai fixture debug minimal.

## 10. Rilis dan Windows

1. Jelaskan bahwa aplikasi disiapkan sebagai Electron app lokal-first.
2. Untuk Windows, pipeline memakai launcher Python cross-platform.
3. Build Windows tetap membutuhkan environment Python Windows di `data_model_KP/run_model/.venv` dan `.venv-mmaction-modern`.
