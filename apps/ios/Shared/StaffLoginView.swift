import SwiftUI

public struct StaffLoginView: View {
    @Bindable private var auth: StaffAuthStore
    private let title: String
    @State private var username = ""
    @State private var password = ""

    public init(auth: StaffAuthStore, title: String) {
        self.auth = auth
        self.title = title
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Логин", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Пароль", text: $password)
                }
                if let errorMessage = auth.errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button {
                        Task { await auth.login(username: username.trimmingCharacters(in: .whitespaces), password: password) }
                    } label: {
                        HStack {
                            Spacer()
                            if auth.isLoading { ProgressView() } else { Text("Войти").fontWeight(.semibold) }
                            Spacer()
                        }
                    }
                    .disabled(auth.isLoading || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
                }
            }
            .navigationTitle(title)
        }
    }
}
