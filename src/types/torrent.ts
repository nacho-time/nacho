export interface TorrentResult {
  title: string;
  size: number;
  seeders: number;
  peers: number;
  download_url: string;
  magnet_url: string | null;
  indexer: string;
  publish_date: string | null;
}
