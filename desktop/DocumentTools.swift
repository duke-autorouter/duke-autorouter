import AppKit
import Foundation
import PDFKit
import QuickLookThumbnailing

// File conversion only. The host validates project scope before invoking this
// helper. It has no UI, account access, scripting interface or network operation.
@main
struct DocumentTools {
    static func main() async {
        do {
            let input = FileHandle.standardInput.readDataToEndOfFile()
            guard let args = try JSONSerialization.jsonObject(with: input) as? [String: Any],
                  let path = args["path"] as? String,
                  let operation = args["operation"] as? String else {
                throw NSError(domain: "DUKE", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid document request"])
            }
            let url = URL(fileURLWithPath: path)
            var result: [String: Any] = [:]
            if operation == "pdf_text" || operation == "pdf_image" {
                guard let pdf = PDFDocument(url: url), !pdf.isLocked, pdf.pageCount > 0 else {
                    throw NSError(domain: "DUKE", code: 2, userInfo: [NSLocalizedDescriptionKey: "PDF is unreadable or requires a password"])
                }
                result["pages"] = pdf.pageCount
                if operation == "pdf_text" {
                    var text = ""
                    var hasText = false
                    var pagesWithoutText: [Int] = []
                    let maxPages = min(pdf.pageCount, 100)
                    for index in 0..<maxPages {
                        let body = pdf.page(at: index)?.string ?? ""
                        let pageHasText = !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        hasText = hasText || pageHasText
                        if !pageHasText { pagesWithoutText.append(index + 1) }
                        text += "\n[Page \(index + 1)]\n" + body
                        if text.count > 200_000 { break }
                    }
                    result["text"] = String(text.prefix(200_000))
                    result["truncated"] = text.count > 200_000 || maxPages < pdf.pageCount
                    result["hasText"] = hasText
                    result["pagesWithoutText"] = pagesWithoutText
                } else {
                    let number = args["page"] as? Int ?? 1
                    guard number >= 1, number <= pdf.pageCount,
                          let page = pdf.page(at: number - 1), let output = args["output"] as? String else {
                        throw NSError(domain: "DUKE", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid PDF page or output"])
                    }
                    let size = page.bounds(for: .mediaBox).size
                    let scale = min(1200 / max(size.width, 1), 1600 / max(size.height, 1))
                    let image = page.thumbnail(of: NSSize(width: size.width * scale, height: size.height * scale), for: .mediaBox)
                    try save(image: image, to: output)
                    result["page"] = number
                    result["output"] = output
                }
            } else if operation == "thumbnail" {
                guard let output = args["output"] as? String else {
                    throw NSError(domain: "DUKE", code: 4, userInfo: [NSLocalizedDescriptionKey: "Missing preview output"])
                }
                let request = QLThumbnailGenerator.Request(fileAt: url, size: CGSize(width: 1200, height: 1600), scale: 1, representationTypes: .thumbnail)
                let representation = try await QLThumbnailGenerator.shared.generateBestRepresentation(for: request)
                guard representation.type != .icon else {
                    throw NSError(domain: "DUKE", code: 5, userInfo: [NSLocalizedDescriptionKey: "Only a file icon is available; document preview is incomplete"])
                }
                try save(image: representation.nsImage, to: output)
                result = ["output": output, "coverage": "Quick Look thumbnail only; does not cover every page or sheet"]
            } else {
                throw NSError(domain: "DUKE", code: 6, userInfo: [NSLocalizedDescriptionKey: "Unsupported document operation"])
            }
            print(String(data: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!)
        } catch {
            let output = ["error": error.localizedDescription]
            print(String(data: try! JSONSerialization.data(withJSONObject: output), encoding: .utf8)!)
            exit(1)
        }
    }

    static func save(image: NSImage, to path: String) throws {
        guard let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]) else {
            throw NSError(domain: "DUKE", code: 7, userInfo: [NSLocalizedDescriptionKey: "Could not render document image"])
        }
        try png.write(to: URL(fileURLWithPath: path), options: .atomic)
    }
}
